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
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { loadQaConfig } from '../server/config.mjs';
import { decryptRecording } from '../server/crypto.mjs';
import { issueMatchesReviewFindings, JiraClient } from '../server/jira-client.mjs';
import { withExpoWebServer } from './app-server.mjs';
import { reviewWithClaude } from './claude-review.mjs';
import { runCommand } from './command.mjs';
import { GitHubClient } from './github.mjs';
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
      ['worktree', 'add', '--force', '-B', branch, worktree, `origin/${branch}`],
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
  await runCommand(
    getCodexPath(),
    [
      'exec',
      '-C',
      worktree,
      '-s',
      'workspace-write',
      '-a',
      'never',
      '--output-schema',
      resolve(worktree, 'qa/automation/codex-result-schema.json'),
      '-o',
      resultPath,
      buildCodexPrompt(
        issue,
        issueContextPath,
        recordingPaths,
        baselineReplayPath,
      ),
    ],
    {
      cwd: worktree,
      sensitive: true,
      timeoutMs: 90 * 60 * 1000,
    },
  );
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
  await runCommand('git', ['push', '-u', 'origin', branch], {
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

async function processIssue({ jira, github, config, issue, dryRun }) {
  const issueDetails = await jira.getIssue(issue.key);
  const parentKey = issueDetails.fields.parent?.key ?? issue.key;
  const parentDetails =
    parentKey === issue.key ? issueDetails : await jira.getIssue(parentKey);

  if (issue.key !== parentKey && parentDetails.fields.status?.name === config.jiraDoneStatus) {
    if (dryRun) {
      console.log(`[dry-run] ${issue.key}: mark done because ${parentKey} is done`);
    } else {
      await jira.transitionIssue(issue.key, config.jiraDoneStatus);
    }
    return;
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
    return;
  }

  const existingPullRequestNumber = getPullRequestNumber(issueDetails);
  const existingPullRequest = existingPullRequestNumber
    ? await github.getPullRequest(existingPullRequestNumber)
    : null;
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
    return;
  }
  const branch =
    existingPullRequest?.headRefName ??
    `codex/${issue.key}-${slugify(issueDetails.fields.summary)}`;

  if (dryRun) {
    console.log(
      `[dry-run] ${issue.key}: ${existingPullRequest ? `update PR #${existingPullRequest.number}` : `create ${branch}`}`,
    );
    return;
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
    await reviewAndGate({
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

  if (!config.jiraConfigured || !config.recordingEncryptionConfigured) {
    throw new Error('Run npm run qa:setup and complete the Jira/recording settings first.');
  }

  const now = new Date();
  const deadline = buildDeadline(now, config.nightlyEndHour);
  if (!force && !once && now >= deadline) {
    console.log('Outside the 00:30-07:00 QA window. Use --force for a manual run.');
    return;
  }

  mkdirSync(dirname(lockPath), { recursive: true });
  let lockFile;
  try {
    lockFile = openSync(lockPath, 'wx', 0o600);
    writeFileSync(lockFile, String(process.pid));
  } catch {
    throw new Error(`Another QA nightly runner is active (${lockPath}).`);
  }

  const jira = new JiraClient(config);
  const github = new GitHubClient(config.githubRepository);

  try {
    await github.ensureAuthenticated();
    if (!dryRun) {
      await reconcileMergedPullRequests(jira, github, config);
      await cleanupExpiredRecordings(jira, config);
    }

    do {
      const queue = await jira.searchReadyIssues();
      if (queue.length === 0) {
        console.log('QA queue is empty.');
        break;
      }

      await processIssue({ jira, github, config, issue: queue[0], dryRun });
      if (once || dryRun) {
        break;
      }
    } while (Date.now() < deadline.getTime());
  } finally {
    if (lockFile !== undefined) {
      closeSync(lockFile);
    }
    rmSync(lockPath, { force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(
    `QA nightly runner stopped: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
