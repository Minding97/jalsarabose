import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { loadQaConfig } from '../server/config.mjs';
import { decryptRecording } from '../server/crypto.mjs';
import { issueMatchesReviewFindings, JiraClient } from '../server/jira-client.mjs';
import { withExpoWebServer } from './app-server.mjs';
import { reviewWithClaude } from './claude-review.mjs';
import { runCodexCommand } from './codex-command.mjs';
import { runCommand } from './command.mjs';
import { GitHubClient } from './github.mjs';
import { isTestNotificationRun, notifyAutomationSummary } from './notification.mjs';
import {
  buildNightlyPlan,
  canRunTogether,
  executePlannedIssue,
  isVerifiedCompletion,
  reportNightlyPlan,
  resolveExternalDependencies,
  shouldStopForDeadline,
  unsatisfiedDependencies,
  workGroupKey,
} from './nightly-plan.mjs';
import { replayRecording } from './replay.mjs';

const automationDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(automationDirectory, '../..');
const artifactsRoot = resolve(repositoryRoot, 'qa-artifacts');
const worktreesRoot = resolve(tmpdir(), 'jalsarabose-qa-worktrees');
const lockPath = resolve(tmpdir(), 'jalsarabose-qa-nightly.lock');
const maxReviewCycles = 3;
const maxEncryptedRecordingBytes = 6 * 1024 * 1024;
const maxDecryptedRecordingBytes = 12 * 1024 * 1024;

function parseFlags(argv) {
  return new Set(argv.filter((value) => value.startsWith('--')));
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return slug || 'ticket';
}

function getPullRequestNumber(issue) {
  const labels = issue.fields?.labels ?? [];
  const match = labels.map((label) => label.match(/^pr-(\d+)$/)).find(Boolean);
  return match ? Number(match[1]) : null;
}

function getCodexPath() {
  if (process.env.CODEX_CLI_PATH) {
    return process.env.CODEX_CLI_PATH;
  }

  const appBundledPath = '/Applications/ChatGPT.app/Contents/Resources/codex';
  return existsSync(appBundledPath) ? appBundledPath : 'codex';
}

function buildDeadline(now, endHour) {
  const deadline = new Date(now);
  deadline.setHours(endHour, 0, 0, 0);
  return deadline;
}

export function classifyNightlyStatus(ticketResults, plannedCount = ticketResults.length) {
  if (ticketResults.some((item) => item.category === 'failure')) return '구현/테스트 실패 있음';
  if (plannedCount > ticketResults.filter((item) => item.result === '완료').length) return '후속 작업 있음';
  return '성공';
}

export function classifyMergeStage(pullRequest) {
  if (pullRequest?.state === 'MERGED' || pullRequest?.mergedAt) return '완료';
  return pullRequest?.mergeStateStatus === 'DIRTY' ? '재작업 예정' : '병합 대기';
}

export function blockedTicketReason(blockers, ticketResults) {
  return blockers.map((blocker) => {
    const upstream = ticketResults.find((item) => item.key === blocker);
    return upstream
      ? `${blocker}=${upstream.result}: ${upstream.reason || '상세 이유 미기록'}`
      : `${blocker}=완료/병합 미확인`;
  }).join('; ');
}

export function captureNightlyPlanSummary(summary, plan) {
  summary.ticketResults ??= [];
  summary.plannedTickets = (plan.reportIssues ?? plan.issues).map((issue) => issue.key);
  const blocked = [...plan.externallyBlockedKeys, ...plan.cyclicKeys];
  summary.ticketResults.push(
    ...plan.externallyBlockedKeys.map((key) => {
      const dependencies = plan.dependencies?.get(key) ?? [];
      const details = dependencies
        .filter((dependency) => plan.externalFailures?.has(dependency))
        .map((dependency) => `${dependency}: ${plan.externalFailures.get(dependency)}`);
      return {
        key, result: '외부 선행조건 차단', category: 'blocked',
        reason: details.length ? details.join('; ') : `큐 밖 선행 티켓 ${dependencies.join(', ') || '미상'} 미완료`,
      };
    }),
    ...plan.cyclicKeys.map((key) => ({
      key, result: '의존 순환 차단', category: 'blocked',
      reason: `Jira 의존 순환: ${(plan.dependencies?.get(key) ?? []).join(', ') || key}`,
    })),
  );
  summary.remainingQueue = [...new Set([...summary.plannedTickets, ...blocked])];
  if (plan.issues.length === 0) {
    summary.status = blocked.length ? '후속 작업 있음' : '성공';
    summary.verification = plan.counts.total
      ? `큐 스냅샷 ${plan.counts.total}건 확인 · 실행 가능 0건`
      : '큐 스냅샷 0건 확인 · 처리 티켓 없음';
    summary.nextAction = blocked.length
      ? `차단/순환 티켓 ${blocked.join(', ')}의 선행조건 확인`
      : '다음 야간 큐 대기';
  }
  return summary;
}

export async function finalizeNightlySummary({ summary, plan, jira }) {
  const representativeByGroup = new Map(plan.issues.map((issue) => [workGroupKey(issue), issue.key]));
  for (const duplicateKey of plan.duplicateKeys ?? []) {
    const duplicate = plan.reportIssues.find((issue) => issue.key === duplicateKey);
    const representativeKey = duplicate && representativeByGroup.get(workGroupKey(duplicate));
    const representative = summary.ticketResults.find((item) => item.key === representativeKey);
    summary.ticketResults.push({
      key: duplicateKey,
      result: representative?.result === '완료' ? '완료' : '작업 묶음 대기',
      category: representative?.category === 'failure' ? 'blocked' : (representative?.category ?? 'pending'),
      reason: representative
        ? `동일 작업 묶음 ${representativeKey} 결과 전파: ${representative.result} — ${representative.reason || '상세 이유 미기록'}`
        : `동일 작업 묶음 대표 티켓 ${representativeKey ?? '미상'} 결과 없음`,
    });
  }
  const finalQueue = await jira.searchReadyIssues();
  const planned = new Set(plan.reportIssues.map((issue) => issue.key));
  summary.remainingQueue = finalQueue.map((issue) => issue.key);
  summary.lateOutcomes = finalQueue
    .filter((issue) => !planned.has(issue.key))
    .map((issue) => `${issue.key}=${issue.fields?.summary ?? '새 후속 티켓'}`);
  summary.status = classifyNightlyStatus(summary.ticketResults, plan.issues.length);
  if (summary.remainingQueue.length > 0 && summary.status === '성공') summary.status = '후속 작업 있음';
  const completed = summary.ticketResults.filter((item) => item.result === '완료').length;
  const checked = summary.ticketResults.length;
  summary.verification = `처리 단계 ${checked}/${plan.issues.length}건 확인 · 완료 ${completed}건 · 최종 Jira 큐 ${summary.remainingQueue.length}건`;
  summary.nextAction = summary.remainingQueue.length ? '최종 남은 큐의 선행 PR/리뷰 상태 확인' : '다음 야간 큐 대기';
  return summary;
}
export function acquireNightlyLock(path) {
  try {
    const descriptor = openSync(path, 'wx', 0o600);
    writeFileSync(descriptor, String(process.pid));
    return descriptor;
  } catch (error) {
    if (error?.code === 'EEXIST') {
      const contention = new Error(`Another QA nightly runner is active (${path}).`);
      contention.code = 'QA_NIGHTLY_LOCKED';
      throw contention;
    }
    throw error;
  }
}

async function createWorktree(issue, existingPullRequest, branch) {
  const worktree = resolve(worktreesRoot, issue.key);
  mkdirSync(worktreesRoot, { recursive: true });

  if (existsSync(worktree)) {
    await runCommand('git', ['worktree', 'remove', '--force', worktree], {
      cwd: repositoryRoot,
      allowFailure: true,
    });
    rmSync(worktree, { recursive: true, force: true });
  }

  await runCommand('git', ['worktree', 'prune'], { cwd: repositoryRoot });

  if (existingPullRequest) {
    await runCommand('git', ['fetch', 'origin', branch], { cwd: repositoryRoot });
    await runCommand(
      'git',
      buildWorktreeAddArgs(worktree, `origin/${branch}`),
      { cwd: repositoryRoot },
    );
  } else {
    await runCommand('git', ['fetch', 'origin', 'main'], { cwd: repositoryRoot });
    await runCommand(
      'git',
      ['worktree', 'add', '--force', '-B', branch, worktree, 'origin/main'],
      { cwd: repositoryRoot },
    );
  }

  const rootNodeModules = resolve(repositoryRoot, 'node_modules');
  const worktreeNodeModules = resolve(worktree, 'node_modules');
  if (existsSync(rootNodeModules) && !existsSync(worktreeNodeModules)) {
    symlinkSync(rootNodeModules, worktreeNodeModules, 'dir');
  }

  const rootEnv = resolve(repositoryRoot, '.env.local');
  if (existsSync(rootEnv)) {
    copyFileSync(rootEnv, resolve(worktree, '.env.local'));
    chmodSync(resolve(worktree, '.env.local'), 0o600);
  }

  return worktree;
}

export function buildWorktreeAddArgs(worktree, startPoint) {
  // A PR branch may already be checked out in an operator worktree.  A detached
  // automation worktree avoids resetting or claiming that shared local branch.
  return ['worktree', 'add', '--force', '--detach', worktree, startPoint];
}

async function downloadRecordings(jira, issue, issueArtifacts, config) {
  const recordingPaths = [];
  mkdirSync(issueArtifacts, { recursive: true });

  for (const attachment of issue.fields?.attachment ?? []) {
    if (!attachment.filename?.endsWith('.json.gz.enc')) {
      continue;
    }

    const encrypted = await jira.downloadAttachment(attachment);
    if (encrypted.byteLength > maxEncryptedRecordingBytes) {
      throw new Error(`Encrypted Recording is too large: ${attachment.filename}`);
    }
    const decrypted = gunzipSync(decryptRecording(encrypted, config.recordingKey), {
      maxOutputLength: maxDecryptedRecordingBytes,
    });
    const destination = resolve(
      issueArtifacts,
      basename(attachment.filename).replace(/\.gz\.enc$/, ''),
    );
    writeFileSync(destination, decrypted, { mode: 0o600 });
    recordingPaths.push(destination);
  }

  return recordingPaths;
}

async function runReplaySuite({
  worktree,
  recordingPaths,
  issueArtifacts,
  config,
  phase,
  requireSuccess,
}) {
  if (recordingPaths.length === 0) {
    return null;
  }

  const results = await withExpoWebServer(
    { worktree, port: config.replayPort },
    async (appUrl) => {
      const suiteResults = [];
      for (let index = 0; index < recordingPaths.length; index += 1) {
        const result = await replayRecording({
          recordingPath: recordingPaths[index],
          appUrl,
          outputPath: resolve(issueArtifacts, `replay-${phase}-${index + 1}.json`),
          screenshotPath: resolve(
            issueArtifacts,
            `replay-${phase}-${index + 1}.png`,
          ),
        });
        suiteResults.push(result);
      }
      return suiteResults;
    },
  );

  const summaryPath = resolve(worktree, `.qa/replay-${phase}.json`);
  writeFileSync(summaryPath, `${JSON.stringify(results, null, 2)}\n`, { mode: 0o600 });
  if (requireSuccess && results.some((result) => !result.passed)) {
    throw new Error(`Recording replay failed after the fix. See ${summaryPath}.`);
  }
  return summaryPath;
}

function buildCodexPrompt(issue, issueContextPath, recordingPaths, baselineReplayPath) {
  return [
    `Implement Jira QA ticket ${issue.key}: ${issue.fields.summary}`,
    `The full ticket context is in ${issueContextPath}.`,
    recordingPaths.length > 0
      ? `The decrypted QA recordings are: ${recordingPaths.join(', ')}. Use npm run qa:replay to reproduce them when feasible.`
      : 'No Recording is attached. Reproduce from the memo and current code.',
    baselineReplayPath
      ? `The automated baseline replay result is in ${baselineReplayPath}.`
      : 'No automated baseline replay was available.',
    'Work only in this worktree. Inspect existing patterns before editing.',
    'Do not commit, push, open a PR, or expose credentials in source, logs, comments, snapshots, or test fixtures.',
    'Fix the root cause, add a focused regression test when feasible, and run npm run qa:test and npm run verify.',
    'Return a JSON result matching qa/automation/codex-result-schema.json.',
  ].join('\n');
}

async function runCodex(
  issue,
  worktree,
  issueArtifacts,
  issueContextPath,
  recordingPaths,
  baselineReplayPath,
) {
  const resultPath = resolve(worktree, '.qa/codex-result.json');
  await runCodexCommand({
    codexPath: getCodexPath(),
    worktree,
    schemaPath: resolve(worktree, 'qa/automation/codex-result-schema.json'),
    resultPath,
    prompt: buildCodexPrompt(
      issue,
      issueContextPath,
      recordingPaths,
      baselineReplayPath,
    ),
  });
  copyFileSync(resultPath, resolve(issueArtifacts, 'codex-result.json'));
  return JSON.parse(readFileSync(resultPath, 'utf8'));
}

async function commitAndPush(issue, worktree, branch) {
  const status = await runCommand('git', ['status', '--porcelain'], { cwd: worktree });
  if (!status.stdout.trim()) {
    throw new Error('Codex completed without changing tracked files.');
  }

  await runCommand('npm', ['run', 'qa:test'], { cwd: worktree, timeoutMs: 10 * 60 * 1000 });
  await runCommand('npm', ['run', 'verify'], { cwd: worktree, timeoutMs: 30 * 60 * 1000 });
  await runCommand('git', ['add', '-A'], { cwd: worktree });
  await runCommand('git', ['commit', '-m', `fix: ${issue.key} ${issue.fields.summary}`], {
    cwd: worktree,
  });
  await runCommand('git', ['push', 'origin', `HEAD:refs/heads/${branch}`], {
    cwd: worktree,
    timeoutMs: 10 * 60 * 1000,
  });
  const sha = await runCommand('git', ['rev-parse', 'HEAD'], { cwd: worktree });
  return sha.stdout.trim();
}

function formatReviewComment(review, cycle) {
  const findings = review.findings
    .map(
      (finding) =>
        `- **${finding.severity} ${finding.title}** (${finding.file}:${finding.line ?? '-'})\n  ${finding.evidence}`,
    )
    .join('\n');
  return [
    `<!-- qa-review-cycle:${cycle} -->`,
    `## Claude QA Review ${cycle}/${maxReviewCycles}`,
    '',
    review.summary,
    '',
    findings || '차단 또는 권고 사항이 없습니다.',
  ].join('\n');
}

async function waitForMerge(github, pullRequestNumber) {
  const expiresAt = Date.now() + 2 * 60 * 1000;
  while (Date.now() < expiresAt) {
    const pullRequest = await github.getPullRequest(pullRequestNumber);
    if (pullRequest.state === 'MERGED' || pullRequest.mergedAt) {
      return true;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10000));
  }
  return false;
}

async function reviewAndGate({
  jira,
  github,
  config,
  issue,
  parentKey,
  worktree,
  issueArtifacts,
  pullRequest,
  sha,
}) {
  const previousCycle = await github.getReviewCycle(pullRequest.number);
  const cycle = previousCycle + 1;
  await github.setCommitStatus(
    sha,
    'pending',
    `Claude review ${cycle}/${maxReviewCycles} running`,
    `${config.jiraBaseUrl}/browse/${parentKey}`,
  );
  const review = await reviewWithClaude({
    worktree,
    issueKey: parentKey,
    pullRequestNumber: pullRequest.number,
    outputPath: resolve(issueArtifacts, `claude-review-${cycle}.json`),
  });
  await github.comment(pullRequest.number, formatReviewComment(review, cycle));

  const blockers = review.findings.filter((finding) =>
    ['P0', 'P1', 'P2'].includes(finding.severity),
  );

  if (blockers.length > 0) {
    await github.setCommitStatus(
      sha,
      'failure',
      `${blockers.length} blocking Claude finding(s)`,
      `${config.jiraBaseUrl}/browse/${parentKey}`,
    );

    if (cycle >= maxReviewCycles) {
      await jira.transitionIssue(parentKey, config.jiraNeedsHumanStatus);
      if (issue.key !== parentKey) {
        await jira.transitionIssue(issue.key, config.jiraNeedsHumanStatus);
      }
      await jira.addComment(
        parentKey,
        `Claude 리뷰 ${cycle}회 후에도 차단 항목 ${blockers.length}건이 남아 사람 확인이 필요합니다.`,
      );
      return { needsHuman: true, merged: false, stage: '재작업 예정' };
    }

    for (const finding of blockers) {
      finding.fingerprint =
        finding.fingerprint ||
        createHash('sha256')
          .update(`${finding.severity}:${finding.file}:${finding.line}:${finding.title}`)
          .digest('hex')
          .slice(0, 32);
      const existing = await jira.findReviewSubtask(parentKey, finding.fingerprint);
      if (!existing) {
        await jira.createReviewSubtask(parentKey, finding, pullRequest.number);
      } else {
        await jira.addComment(
          existing.key,
          `Claude 재리뷰 ${cycle}: ${finding.evidence}\n완료 조건: ${finding.acceptanceCriteria}`,
        );
        await jira.transitionIssue(existing.key, config.jiraReadyStatus);
      }
    }
    if (
      issue.key !== parentKey &&
      !issueMatchesReviewFindings(issue, blockers)
    ) {
      await jira.transitionIssue(issue.key, config.jiraDoneStatus);
    }
    return { needsHuman: false, merged: false, stage: '리뷰 반영 예정' };
  }

  await github.setCommitStatus(
    sha,
    'success',
    'Claude review passed',
    `${config.jiraBaseUrl}/browse/${parentKey}`,
  );
  await github.enableAutoMerge(pullRequest.number);
  const merged = await waitForMerge(github, pullRequest.number);
  if (merged) {
    await jira.transitionIssue(parentKey, config.jiraDoneStatus);
    if (issue.key !== parentKey) {
      await jira.transitionIssue(issue.key, config.jiraDoneStatus);
    }
  }
  const finalPullRequest = merged ? pullRequest : await github.getPullRequest(pullRequest.number);
  return { needsHuman: false, merged, stage: classifyMergeStage(finalPullRequest) };
}

function ticketOutcome(result, category = 'pending', reason = '') {
  return { completed: result === '완료', result, category, reason };
}

export async function processIssue({ jira, github, config, issue, dryRun }) {
  const issueDetails = await jira.getIssue(issue.key);
  const parentKey = issueDetails.fields.parent?.key ?? issue.key;
  const parentDetails =
    parentKey === issue.key ? issueDetails : await jira.getIssue(parentKey);
  const existingPullRequestNumber = getPullRequestNumber(issueDetails)
    ?? (issue.key !== parentKey ? getPullRequestNumber(parentDetails) : null);
  let existingPullRequest = null;
  try {
    existingPullRequest = existingPullRequestNumber
      ? await github.getPullRequest(existingPullRequestNumber)
      : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${issue.key} PR lookup failed:`, message);
    return ticketOutcome('PR 조회 실패', 'failure', `PR #${existingPullRequestNumber} 조회 실패: ${message.split(/\r?\n/, 1)[0]}`);
  }

  if (issue.key !== parentKey && parentDetails.fields.status?.name === config.jiraDoneStatus) {
    if (dryRun) {
      console.log(`[dry-run] ${issue.key}: mark done because ${parentKey} is done`);
    } else {
      await jira.transitionIssue(issue.key, config.jiraDoneStatus);
    }
    const completed = await jira.getIssue(issue.key);
    return isVerifiedCompletion(completed, existingPullRequest, config.jiraDoneStatus)
      ? ticketOutcome('완료', 'complete')
      : ticketOutcome('병합 상태 확인 필요', 'pending', `PR #${existingPullRequestNumber} 미병합`);
  }

  if (
    issue.key !== parentKey &&
    parentDetails.fields.status?.name === config.jiraNeedsHumanStatus
  ) {
    if (dryRun) {
      console.log(`[dry-run] ${issue.key}: skip because ${parentKey} needs human review`);
    } else {
      await jira.transitionIssue(issue.key, config.jiraNeedsHumanStatus);
    }
    return ticketOutcome('재작업 예정', 'pending', `상위 ${parentKey} 사람 확인 필요`);
  }

  if (
    existingPullRequest &&
    (existingPullRequest.state === 'MERGED' || existingPullRequest.mergedAt)
  ) {
    if (dryRun) {
      console.log(`[dry-run] ${issue.key}: mark done because PR is merged`);
    } else {
      await jira.transitionIssue(parentKey, config.jiraDoneStatus);
      if (issue.key !== parentKey) {
        await jira.transitionIssue(issue.key, config.jiraDoneStatus);
      }
    }
    const completed = await jira.getIssue(issue.key);
    return isVerifiedCompletion(completed, existingPullRequest, config.jiraDoneStatus)
      ? ticketOutcome('완료', 'complete')
      : ticketOutcome('병합 상태 확인 필요', 'pending', `PR #${existingPullRequest.number} 병합 상태 불일치`);
  }
  const branch =
    existingPullRequest?.headRefName ??
    `codex/${issue.key}-${slugify(issueDetails.fields.summary)}`;

  if (dryRun) {
    console.log(
      `[dry-run] ${issue.key}: ${existingPullRequest ? `update PR #${existingPullRequest.number}` : `create ${branch}`}`,
    );
    return ticketOutcome('실행 예정', 'pending', existingPullRequest
      ? `PR #${existingPullRequest.number} 검토 예정`
      : '새 구현 브랜치 생성 예정');
  }

  await jira.transitionIssue(issue.key, config.jiraInProgressStatus);
  const issueArtifacts = resolve(
    artifactsRoot,
    new Date().toISOString().slice(0, 10),
    issue.key,
  );
  mkdirSync(issueArtifacts, { recursive: true, mode: 0o700 });
  let worktree;
  try {
    worktree = await createWorktree(issueDetails, existingPullRequest, branch);
    const qaInputDirectory = resolve(worktree, '.qa');
    mkdirSync(qaInputDirectory, { recursive: true, mode: 0o700 });
    const issueContextPath = resolve(qaInputDirectory, 'jira-issue.json');
    writeFileSync(
      issueContextPath,
      `${JSON.stringify(
        {
          issue: issueDetails,
          parent: parentKey === issue.key ? null : parentDetails,
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );
    const recordingPaths = await downloadRecordings(
      jira,
      parentDetails,
      qaInputDirectory,
      config,
    );
    const baselineReplayPath = await runReplaySuite({
      worktree,
      recordingPaths,
      issueArtifacts,
      config,
      phase: 'before',
      requireSuccess: false,
    });
    const codexResult = await runCodex(
      issueDetails,
      worktree,
      issueArtifacts,
      issueContextPath,
      recordingPaths,
      baselineReplayPath,
    );
    await runReplaySuite({
      worktree,
      recordingPaths,
      issueArtifacts,
      config,
      phase: 'after',
      requireSuccess: true,
    });
    const sha = await commitAndPush(issueDetails, worktree, branch);
    const pullRequest =
      existingPullRequest ??
      (await github.createPullRequest({
        branch,
        title: `[${parentKey}] ${issueDetails.fields.summary}`,
        body: [
          `Jira: ${config.jiraBaseUrl}/browse/${parentKey}`,
          '',
          codexResult.summary,
          '',
          '### Verification',
          ...codexResult.tests.map((test) => `- ${test}`),
          '',
          `Recording reproduction: ${codexResult.reproduction}`,
          '',
          'Raw QA recordings and captured input values are intentionally excluded.',
        ].join('\n'),
      }));

    await jira.addLabel(parentKey, `pr-${pullRequest.number}`);
    if (issue.key !== parentKey) {
      await jira.addLabel(issue.key, `pr-${pullRequest.number}`);
    }
    await jira.transitionIssue(parentKey, config.jiraReviewStatus);
    const reviewResult = await reviewAndGate({
      jira,
      github,
      config,
      issue: issueDetails,
      parentKey,
      worktree,
      issueArtifacts,
      pullRequest,
      sha,
    });
    if (!reviewResult.merged) {
      return ticketOutcome(
        reviewResult.stage,
        'pending',
        reviewResult.stage === '재작업 예정'
          ? `PR #${pullRequest.number} 리뷰 차단 또는 충돌`
          : reviewResult.stage === '리뷰 반영 예정'
            ? `PR #${pullRequest.number} 리뷰 후속 티켓 처리 대기`
            : `PR #${pullRequest.number} 승인 또는 병합 대기`,
      );
    }
    const [completedIssue, mergedPullRequest] = await Promise.all([
      jira.getIssue(issue.key),
      github.getPullRequest(pullRequest.number),
    ]);
    return isVerifiedCompletion(completedIssue, mergedPullRequest, config.jiraDoneStatus)
      ? ticketOutcome('완료', 'complete')
      : ticketOutcome('병합 상태 확인 필요', 'pending', `PR #${pullRequest.number} 병합/Jira 완료 불일치`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await jira.addComment(issue.key, `야간 자동수정 실패: ${message.slice(0, 3000)}`);
    } catch (jiraError) {
      console.error(`${issue.key} failure comment failed:`, jiraError);
    }
    try {
      await jira.transitionIssue(issue.key, config.jiraNeedsHumanStatus);
    } catch (jiraError) {
      console.error(`${issue.key} failure transition failed:`, jiraError);
    }
    console.error(`${issue.key} failed:`, message);
    return ticketOutcome('구현/테스트 실패', 'failure', message.split(/\r?\n/, 1)[0].slice(0, 240));
  } finally {
    if (worktree) {
      rmSync(resolve(worktree, '.qa'), { recursive: true, force: true });
      const localEnv = resolve(worktree, '.env.local');
      if (existsSync(localEnv)) {
        unlinkSync(localEnv);
      }
      await runCommand('git', ['worktree', 'remove', '--force', worktree], {
        cwd: repositoryRoot,
        allowFailure: true,
      });
    }
  }
}

async function reconcileMergedPullRequests(jira, github, config) {
  const reviewIssues = await jira.searchIssuesByStatus(config.jiraReviewStatus);
  for (const issue of reviewIssues) {
    const pullRequestNumber = getPullRequestNumber(issue);
    if (!pullRequestNumber) {
      continue;
    }
    const pullRequest = await github.getPullRequest(pullRequestNumber);
    if (pullRequest.state === 'MERGED' || pullRequest.mergedAt) {
      await jira.transitionIssue(issue.key, config.jiraDoneStatus);
    }
  }
}

async function cleanupExpiredRecordings(jira, config) {
  const issues = await jira.searchIssuesByStatus(
    config.jiraDoneStatus,
    `AND updated <= -${config.recordingRetentionDays}d`,
  );
  for (const issue of issues) {
    for (const attachment of issue.fields?.attachment ?? []) {
      if (attachment.filename?.endsWith('.json.gz.enc')) {
        await jira.deleteAttachment(attachment.id);
      }
    }
  }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const dryRun = flags.has('--dry-run');
  const once = flags.has('--once');
  const force = flags.has('--force');
  const config = loadQaConfig();
  const startedAt = new Date().toISOString();
  const summary = {
    kind: 'nightly', runId: `nightly-${startedAt}-${process.pid}`, startedAt,
    testNotification: isTestNotificationRun({
      dryRun,
      explicitTestNotification: flags.has('--test-notification'),
    }),
    status: '성공', plannedTickets: [], ticketResults: [], pullRequests: [],
    verification: '처리 티켓 없음', failures: [], remainingQueue: [], nextAction: '다음 야간 실행',
  };

  const now = new Date();
  const deadline = buildDeadline(now, config.nightlyEndHour);
  if (!force && !once && now >= deadline) {
    console.log('Outside the 00:30-07:00 QA window. Use --force for a manual run.');
    return;
  }

  mkdirSync(dirname(lockPath), { recursive: true });
  let lockFile;
  const jira = new JiraClient(config);
  const github = new GitHubClient(config.githubRepository);

  try {
    lockFile = acquireNightlyLock(lockPath);
    if (!config.jiraConfigured || !config.recordingEncryptionConfigured) {
      throw new Error('Run npm run qa:setup and complete the Jira/recording settings first.');
    }
    await github.ensureAuthenticated();
    if (!dryRun) {
      await reconcileMergedPullRequests(jira, github, config);
      await cleanupExpiredRecordings(jira, config);
    }

    const queueSnapshot = await jira.searchReadyIssues();
    const external = await resolveExternalDependencies({
      issues: queueSnapshot, jira, github, doneStatus: config.jiraDoneStatus,
    });
    const plan = buildNightlyPlan(queueSnapshot, config, external);
    captureNightlyPlanSummary(summary, plan);
    console.log(plan.text);
    await reportNightlyPlan({ jira, plan, config, dryRun });
    if (plan.issues.length === 0) {
        console.log(plan.cyclicKeys.length || plan.externallyBlockedKeys.length
          ? 'QA queue has no actionable tickets; blocked/cyclic tickets were reported.'
          : 'QA queue is empty.');
        return;
    }
    let processedCount = 0;
    const successfulKeys = new Set();
    const pending = [...plan.issues];
    while (pending.length > 0) {
      const issue = pending.shift();
      if (shouldStopForDeadline({ now: Date.now(), deadline, force, once, processedCount })) {
        console.log(`Nightly deadline reached; remaining fixed-plan tickets start with ${issue.key}.`);
        break;
      }
      const batch = [issue];
      if (!once && !dryRun) {
        const secondIndex = pending.findIndex((candidate) =>
          canRunTogether(issue, candidate, plan)
          && unsatisfiedDependencies(plan, candidate.key, successfulKeys).length === 0);
        if (secondIndex >= 0) batch.push(pending.splice(secondIndex, 1)[0]);
      }
      const completed = await Promise.all(batch.map(async (plannedIssue) => ({
        issue: plannedIssue,
        result: await executePlannedIssue({
        plan,
        issue: plannedIssue,
        successfulKeys,
        processIssue: (plannedIssue) => processIssue({
          jira, github, config, issue: plannedIssue, dryRun,
        }),
        holdIssue: async (heldIssue, blockers) => {
          const message = `야간 자동수정 보류: 같은 밤 선행 티켓 ${blockers.join(', ')}의 Jira 완료 및 PR merge가 확인되지 않았습니다. 다음 야간 큐에서 다시 확인합니다.`;
          console.log(`${heldIssue.key}: ${message}`);
          if (!dryRun) await jira.addComment(heldIssue.key, message);
        },
        }),
      })));
      for (const { issue: completedIssue, result } of completed) {
      if (result.held) {
        summary.ticketResults.push({
          key: completedIssue.key,
          result: '선행 작업 대기',
          category: 'blocked',
          reason: blockedTicketReason(result.blockers, summary.ticketResults),
        });
        continue;
      }
      processedCount += 1;
      summary.ticketResults.push({
        key: completedIssue.key,
        ...(typeof result.outcome === 'object'
          ? result.outcome
          : result.succeeded
            ? ticketOutcome('완료', 'complete')
            : ticketOutcome('상태 확인 필요')),
      });
      let prNumber = null;
      try {
        const refreshedIssue = dryRun ? completedIssue : await jira.getIssue(completedIssue.key);
        prNumber = getPullRequestNumber(refreshedIssue);
        if (prNumber) {
          const pullRequest = await github.getPullRequest(prNumber);
          const merged = pullRequest.state === 'MERGED' || Boolean(pullRequest.mergedAt);
          summary.pullRequests.push(`#${prNumber} ${merged ? '병합 완료' : '병합 대기'}`);
        }
      } catch (error) {
        if (prNumber) summary.pullRequests.push(`#${prNumber} 확인 실패`);
        summary.failures.push(`${completedIssue.key} PR 결과 조회 실패: ${error instanceof Error ? error.message : String(error)}`);
      }
      }
      if (once) break;
    }
    await finalizeNightlySummary({ summary, plan, jira });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lockContention = error?.code === 'QA_NIGHTLY_LOCKED';
    summary.status = lockContention ? '중복 실행 건너뜀' : '실패';
    if (!lockContention) summary.failures.push(message);
    summary.nextAction = lockContention ? '진행 중인 야간 실행의 완료 알림 대기' : '야간 로그 확인 후 안전 재실행';
    throw error;
  } finally {
    if (lockFile !== undefined) {
      closeSync(lockFile);
    }
    if (lockFile !== undefined) rmSync(lockPath, { force: true });
    summary.completedAt = new Date().toISOString();
    try {
      await notifyAutomationSummary({ summary, config, dryRun });
    } catch (error) {
      console.error(`Nightly Telegram notification failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(
      `QA nightly runner stopped: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
