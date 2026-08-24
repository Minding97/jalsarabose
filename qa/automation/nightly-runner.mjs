import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
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
  executePlannedIssue,
  isVerifiedCompletion,
  reportNightlyPlan,
  resolveExternalDependencies,
  shouldStopForDeadline,
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

export function validateNightlyStatusConfig(config) {
  const reviewStatus = config.jiraReviewStatus?.trim();
  const needsHumanStatus = config.jiraNeedsHumanStatus?.trim();
  if (reviewStatus && needsHumanStatus && reviewStatus === needsHumanStatus) {
    throw new Error(
      'JIRA_REVIEW_STATUS and JIRA_NEEDS_HUMAN_STATUS must be different so review tickets are not silently skipped.',
    );
  }
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

export function reportVerifiedCompletion({ issue, pullRequest, doneStatus, reportFailure }) {
  const completed = isVerifiedCompletion(issue, pullRequest, doneStatus);
  if (!completed) {
    const jiraStatus = issue?.fields?.status?.name ?? '조회 불가';
    const prStatus = pullRequest?.state ?? (pullRequest?.mergedAt ? 'MERGED' : '조회 불가');
    reportFailure(`완료 검증 실패: Jira=${jiraStatus}, PR=${prStatus}`);
  }
  return completed;
}

export function reportUnmergedReview(pullRequestNumber, reportFailure) {
  reportFailure(`PR #${pullRequestNumber} 리뷰 또는 병합 미완료`);
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
  if (ticketResults.some((item) => item.result === '실패/미병합')) return '일부 실패';
  if (plannedCount > ticketResults.filter((item) => item.result === '성공').length) return '보류/지연';
  return '성공';
}

export function captureNightlyPlanSummary(summary, plan) {
  summary.plannedTickets = plan.issues.map((issue) => issue.key);
  const blocked = [...plan.externallyBlockedKeys, ...plan.cyclicKeys, ...(plan.cappedKeys ?? [])];
  summary.remainingQueue = [...summary.plannedTickets, ...blocked];
  if (plan.issues.length === 0) {
    summary.status = blocked.length ? '보류/지연' : '성공';
    summary.verification = plan.counts.total
      ? `큐 스냅샷 ${plan.counts.total}건 확인 · 실행 가능 0건`
      : '큐 스냅샷 0건 확인 · 처리 티켓 없음';
    summary.nextAction = blocked.length
      ? `차단/순환 티켓 ${blocked.join(', ')}의 선행조건 확인`
      : '다음 야간 큐 대기';
  }
  return summary;
}

export async function prepareNightlyPlan({ queueSnapshot, jira, github, config }) {
  const externalDependencies = await resolveExternalDependencies({
    issues: queueSnapshot, jira, github, doneStatus: config.jiraDoneStatus,
  });
  return buildNightlyPlan(queueSnapshot, config, externalDependencies);
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

  const rootEnv = resolve(repositoryRoot, '.env.local');
  if (existsSync(rootEnv)) {
    copyFileSync(rootEnv, resolve(worktree, '.env.local'));
    chmodSync(resolve(worktree, '.env.local'), 0o600);
  }

  // Each detached worktree owns a reproducible dependency tree. Sharing the
  // operator checkout's node_modules by symlink makes module availability
  // depend on another run's cleanup and has previously leaked absolute paths.
  await runCommand('npm', ['ci', '--ignore-scripts'], {
    cwd: worktree,
    timeoutMs: 10 * 60 * 1000,
  });

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

export function acceptsVerifiedNoop(hasChanges, branchAlreadyPushed, allowVerifiedNoop = false) {
  return !hasChanges && branchAlreadyPushed && allowVerifiedNoop;
}

export function assertWithinNightlyDeadline(deadline, now = Date.now()) {
  if (deadline && now >= deadline.getTime()) {
    const error = new Error(`전체 야간 마감 ${deadline.toISOString()} 도달; 다음 실행에서 재개`);
    error.code = 'QA_NIGHTLY_DEADLINE';
    throw error;
  }
}

async function commitAndPush(issue, worktree, branch, { branchAlreadyPushed = false, allowVerifiedNoop = false, onVerifiedNoop } = {}) {
  const status = await runCommand('git', ['status', '--porcelain'], { cwd: worktree });
  const hasChanges = Boolean(status.stdout.trim());
  if (!hasChanges && !acceptsVerifiedNoop(hasChanges, branchAlreadyPushed, allowVerifiedNoop)) {
    throw new Error('Codex completed without changing tracked files; review repairs require a concrete diff.');
  }
  await runCommand('npm', ['run', 'qa:test'], { cwd: worktree, timeoutMs: 10 * 60 * 1000 });
  await runCommand('npm', ['run', 'verify'], { cwd: worktree, timeoutMs: 30 * 60 * 1000 });
  if (acceptsVerifiedNoop(hasChanges, branchAlreadyPushed, allowVerifiedNoop)) {
    await onVerifiedNoop?.();
    const head = await runCommand('git', ['rev-parse', 'HEAD'], { cwd: worktree });
    return head.stdout.trim();
  }
  removeGeneratedWorktreeLinks(worktree);
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

export function removeGeneratedWorktreeLinks(worktree) {
  const worktreeNodeModules = resolve(worktree, 'node_modules');
  if (existsSync(worktreeNodeModules) && lstatSync(worktreeNodeModules).isSymbolicLink()) {
    unlinkSync(worktreeNodeModules);
  }
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

export async function reviewAndGate({
  jira,
  github,
  config,
  issue,
  parentKey,
  worktree,
  issueArtifacts,
  pullRequest,
  sha,
  repairReviewFindings,
  reviewOperation = reviewWithClaude,
}) {
  const previousCycle = await github.getReviewCycle(pullRequest.number);
  const cycle = previousCycle + 1;
  await github.setCommitStatus(
    sha,
    'pending',
    `Claude review ${cycle}/${maxReviewCycles} running`,
    `${config.jiraBaseUrl}/browse/${parentKey}`,
  );
  const review = await reviewOperation({
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
      return { needsHuman: true, merged: false };
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
      return { needsHuman: false, merged: false };
    }
    if (repairReviewFindings) {
      const repairedSha = await repairReviewFindings(blockers, cycle);
      return reviewAndGate({ jira, github, config, issue, parentKey, worktree, issueArtifacts,
        pullRequest: { ...pullRequest, headRefOid: repairedSha }, sha: repairedSha, repairReviewFindings, reviewOperation });
    }
    return { needsHuman: false, merged: false };
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
  return { needsHuman: false, merged };
}

export async function processIssue({ jira, github, config, issue, dryRun, reportFailure = () => {}, deadline, operations = {} }) {
  const createIssueWorktree = operations.createWorktree ?? createWorktree;
  const executeReplaySuite = operations.runReplaySuite ?? runReplaySuite;
  const executeCodex = operations.runCodex ?? runCodex;
  const executeCommitAndPush = operations.commitAndPush ?? commitAndPush;
  const executeReviewAndGate = operations.reviewAndGate ?? reviewAndGate;
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
    const message = `PR 결과 조회 실패: ${error instanceof Error ? error.message : String(error)}`;
    reportFailure(message);
    console.error(`${issue.key} PR lookup failed:`, message);
    return false;
  }

  if (
    existingPullRequest &&
    (existingPullRequest.state === 'MERGED' || existingPullRequest.mergedAt)
  ) {
    try {
      const gate = await github.getCompletionGate(existingPullRequest.number);
      if (!gate.complete) {
        reportFailure(
          `완료 gate 미통과: merged=${gate.merged}, verify=${gate.verifySuccess}, claude=${gate.claudeSuccess}`,
        );
        return false;
      }
    } catch (error) {
      reportFailure(`완료 gate 조회 실패: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  if (issue.key !== parentKey && parentDetails.fields.status?.name === config.jiraDoneStatus) {
    if (dryRun) {
      console.log(`[dry-run] ${issue.key}: mark done because ${parentKey} is done`);
      return false;
    } else {
      await jira.transitionIssue(issue.key, config.jiraDoneStatus);
    }
    const completed = await jira.getIssue(issue.key);
    return reportVerifiedCompletion({ issue: completed, pullRequest: existingPullRequest, doneStatus: config.jiraDoneStatus, reportFailure });
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
    reportFailure(`상위 티켓 ${parentKey}이 ${config.jiraNeedsHumanStatus} 상태`);
    return false;
  }

  if (
    existingPullRequest &&
    (existingPullRequest.state === 'MERGED' || existingPullRequest.mergedAt)
  ) {
    if (dryRun) {
      console.log(`[dry-run] ${issue.key}: mark done because PR is merged`);
      return false;
    } else {
      await jira.transitionIssue(parentKey, config.jiraDoneStatus);
      if (issue.key !== parentKey) {
        await jira.transitionIssue(issue.key, config.jiraDoneStatus);
      }
    }
    const completed = await jira.getIssue(issue.key);
    return reportVerifiedCompletion({ issue: completed, pullRequest: existingPullRequest, doneStatus: config.jiraDoneStatus, reportFailure });
  }
  const branch =
    existingPullRequest?.headRefName ??
    `codex/${issue.key}-${slugify(issueDetails.fields.summary)}`;

  if (dryRun) {
    console.log(
      `[dry-run] ${issue.key}: ${existingPullRequest ? `update PR #${existingPullRequest.number}` : `create ${branch}`}`,
    );
    return false;
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
    assertWithinNightlyDeadline(deadline);
    worktree = await createIssueWorktree(issueDetails, existingPullRequest, branch);
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
    const baselineReplayPath = await executeReplaySuite({
      worktree,
      recordingPaths,
      issueArtifacts,
      config,
      phase: 'before',
      requireSuccess: false,
    });
    const codexResult = await executeCodex(
      issueDetails,
      worktree,
      issueArtifacts,
      issueContextPath,
      recordingPaths,
      baselineReplayPath,
    );
    await executeReplaySuite({
      worktree,
      recordingPaths,
      issueArtifacts,
      config,
      phase: 'after',
      requireSuccess: true,
    });
    const sha = await executeCommitAndPush(issueDetails, worktree, branch, {
      branchAlreadyPushed: Boolean(existingPullRequest),
      allowVerifiedNoop: Boolean(existingPullRequest),
      onVerifiedNoop: existingPullRequest
        ? () => github.comment(existingPullRequest.number,
          '이번 구현 시도에서 추적 파일 변경이 없었습니다. 기존 SHA의 테스트·검증 결과를 바탕으로 Claude 재리뷰를 진행합니다.')
        : undefined,
    });
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
    const reviewResult = await executeReviewAndGate({
      jira,
      github,
      config,
      issue: issueDetails,
      parentKey,
      worktree,
      issueArtifacts,
      pullRequest,
      sha,
      repairReviewFindings: async (findings, cycle) => {
        assertWithinNightlyDeadline(deadline);
        writeFileSync(issueContextPath, `${JSON.stringify({ issue: issueDetails, parent: parentKey === issue.key ? null : parentDetails,
          reviewRepairCycle: cycle, actionableReviewFindings: findings,
          instruction: 'Fix every actionable P0-P2 finding and bounded relevant bugs; add regression tests and verify.' }, null, 2)}\n`, { mode: 0o600 });
        await executeCodex(issueDetails, worktree, issueArtifacts, issueContextPath, recordingPaths, baselineReplayPath);
        await executeReplaySuite({ worktree, recordingPaths, issueArtifacts, config, phase: `review-${cycle}`, requireSuccess: true });
        return executeCommitAndPush(issueDetails, worktree, branch, {
          branchAlreadyPushed: true,
        });
      },
    });
    if (!reviewResult.merged) {
      reportUnmergedReview(pullRequest.number, reportFailure);
      return false;
    }
    const [completedIssue, mergedPullRequest] = await Promise.all([
      jira.getIssue(issue.key),
      github.getPullRequest(pullRequest.number),
    ]);
    return reportVerifiedCompletion({ issue: completedIssue, pullRequest: mergedPullRequest, doneStatus: config.jiraDoneStatus, reportFailure });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error?.code === 'QA_NIGHTLY_DEADLINE') {
      await jira.transitionIssue(issue.key, config.jiraReadyStatus);
      console.log(`${issue.key}: ${message}`);
      return { succeeded: false, deferred: true };
    }
    reportFailure(message);
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
    return false;
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

export async function completeReviewFamily(jira, config, parent, pullRequestNumber) {
  const marker = `<!-- qa-review-family:${parent.key}:pr-${pullRequestNumber} -->`;
  const pullRequestLabel = `pr-${pullRequestNumber}`;
  const children = await jira.searchReviewChildren(parent.key, pullRequestNumber);
  for (const child of children) {
    if (child.fields?.parent?.key !== parent.key) continue;
    if (!child.fields?.labels?.includes(pullRequestLabel)) continue;
    if (child.fields?.status?.name !== config.jiraDoneStatus) {
      await jira.transitionIssue(child.key, config.jiraDoneStatus);
    }
    const comments = child.fields?.comment?.comments ?? [];
    if (!comments.some((comment) => JSON.stringify(comment.body).includes(marker))) {
      await jira.addComment(
        child.key,
        `${marker}\n상위 ${parent.key}의 PR #${pullRequestNumber}가 main에 병합되고 verify 및 최신 head Claude P0/P1/P2=0 gate를 통과하여 검토 하위 티켓을 완료 처리합니다.`,
      );
    }
  }
}

export async function reconcileMergedPullRequests(jira, github, config) {
  const reviewIssues = await jira.searchIssuesByStatus(config.jiraReviewStatus);
  for (const issue of reviewIssues) {
    const pullRequestNumber = getPullRequestNumber(issue);
    if (!pullRequestNumber) {
      continue;
    }
    const gate = await github.getCompletionGate(pullRequestNumber);
    if (gate.complete) {
      await jira.transitionIssue(issue.key, config.jiraDoneStatus);
      if (!issue.fields?.parent) {
        await completeReviewFamily(jira, config, issue, pullRequestNumber);
      }
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
  validateNightlyStatusConfig(config);
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
    const plan = await prepareNightlyPlan({ queueSnapshot, jira, github, config });
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
    const successfulKeys = new Set(plan.externallySatisfiedKeys);
    for (const issue of plan.issues) {
      if (shouldStopForDeadline({ now: Date.now(), deadline, force, once, processedCount })) {
        console.log(`Nightly deadline reached; remaining fixed-plan tickets start with ${issue.key}.`);
        break;
      }
      const result = await executePlannedIssue({
        plan,
        issue,
        successfulKeys,
        processIssue: (plannedIssue) => processIssue({
          jira, github, config, issue: plannedIssue, dryRun,
          deadline: force || once ? undefined : deadline,
          reportFailure: (reason) => summary.failures.push(`${plannedIssue.key}: ${reason}`),
        }),
        holdIssue: async (heldIssue, blockers) => {
          const message = `야간 자동수정 보류: 같은 밤 선행 티켓 ${blockers.join(', ')}의 Jira 완료 및 PR merge가 확인되지 않았습니다. 다음 야간 큐에서 다시 확인합니다.`;
          console.log(`${heldIssue.key}: ${message}`);
          if (!dryRun) await jira.addComment(heldIssue.key, message);
        },
      });
      if (result.held) {
        const reason = `이번 실행에서 선행 티켓 ${result.blockers?.join(', ') || '미완료'} 처리가 성공하지 않음`;
        summary.ticketResults.push({
          key: issue.key,
          result: '보류',
          reason,
        });
        summary.failures.push(`${issue.key}: ${reason}`);
        continue;
      }
      processedCount += 1;
      summary.ticketResults.push({ key: issue.key, result: result.succeeded ? '성공' : result.deferred ? '보류' : '실패/미병합' });
      let prNumber = null;
      try {
        const refreshedIssue = dryRun ? issue : await jira.getIssue(issue.key);
        prNumber = getPullRequestNumber(refreshedIssue);
        if (prNumber) {
          const pullRequest = await github.getPullRequest(prNumber);
          const merged = pullRequest.state === 'MERGED' || Boolean(pullRequest.mergedAt);
          summary.pullRequests.push(`#${prNumber} ${merged ? 'merged' : '대기'}`);
        }
      } catch (error) {
        if (prNumber) summary.pullRequests.push(`#${prNumber} 확인 실패`);
        summary.failures.push(`${issue.key} PR 결과 조회 실패: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (once || dryRun) {
        break;
      }
    }
    summary.remainingQueue = [...plan.issues
      .filter((issue) => !summary.ticketResults.some((item) => item.key === issue.key && item.result === '성공'))
      .map((issue) => issue.key), ...(plan.cappedKeys ?? [])];
    summary.status = classifyNightlyStatus(summary.ticketResults, plan.issues.length);
    summary.verification = `${summary.ticketResults.filter((item) => item.result === '성공').length}/${plan.issues.length} 티켓 완료 확인`;
    summary.nextAction = summary.remainingQueue.length ? '남은 큐의 선행 PR/리뷰 상태 확인' : '다음 야간 큐 대기';
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
