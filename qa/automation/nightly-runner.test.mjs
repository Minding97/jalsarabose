import assert from 'node:assert/strict';
import { closeSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { acquireNightlyLock, buildWorktreeAddArgs, captureNightlyPlanSummary, classifyNightlyStatus, processIssue, reconcileReviewPullRequests, shouldReviewCommitStatus } from './nightly-runner.mjs';
import { isTestNotificationRun } from './notification.mjs';

const config = {
  jiraDoneStatus: '완료',
  jiraNeedsHumanStatus: '사람 확인 필요',
};

test('reviews an open review-status PR when its current head has no final Claude status', async () => {
  const issue = { key: 'JAL-47', fields: { labels: ['pr-17'], status: { name: '검토 중' } } };
  const reviews = [];
  const jira = {
    searchIssuesByStatus: async () => [issue],
    getIssue: async () => issue,
  };
  const github = {
    getPullRequest: async () => ({ number: 17, state: 'OPEN', headRefName: 'feature', headRefOid: 'b'.repeat(40) }),
    getCommitStatus: async () => null,
  };
  await reconcileReviewPullRequests(jira, github, { ...config, jiraReviewStatus: '검토 중' }, {
    createWorktree: async () => undefined,
    reviewAndGate: async (input) => reviews.push(input.sha),
  });
  assert.deepEqual(reviews, ['b'.repeat(40)]);
});

test('exact-head re-review scope isolates one PR from the review-status queue', async () => {
  const issues = [17, 34].map((number) => ({
    key: `JAL-${number}`,
    fields: { labels: [`pr-${number}`], status: { name: '검토 중' } },
  }));
  const requestedHead = 'b'.repeat(40);
  const inspected = [];
  const reviews = [];
  const jira = {
    searchIssuesByStatus: async () => issues,
    getIssue: async (key) => issues.find((issue) => issue.key === key),
  };
  const github = {
    getPullRequest: async (number) => {
      inspected.push(number);
      return { number, state: 'OPEN', headRefName: 'feature', headRefOid: requestedHead };
    },
    getCommitStatus: async () => null,
  };

  await reconcileReviewPullRequests(jira, github, { ...config, jiraReviewStatus: '검토 중' }, {
    createWorktree: async () => undefined,
    reviewAndGate: async (input) => reviews.push(input.pullRequest.number),
  }, { pullRequestNumber: 17, headSha: requestedHead });

  assert.deepEqual(inspected, [17]);
  assert.deepEqual(reviews, [17]);
});

test('exact-head re-review aborts instead of reviewing a moved PR head', async () => {
  const issue = { key: 'JAL-17', fields: { labels: ['pr-17'], status: { name: '검토 중' } } };
  await assert.rejects(
    reconcileReviewPullRequests(
      { searchIssuesByStatus: async () => [issue] },
      { getPullRequest: async () => ({ number: 17, state: 'OPEN', headRefOid: 'c'.repeat(40) }) },
      { ...config, jiraReviewStatus: '검토 중' },
      {},
      { pullRequestNumber: 17, headSha: 'b'.repeat(40) },
    ),
    /head changed/,
  );
});

test('does not repeat a finalized review for the same head', () => {
  assert.equal(shouldReviewCommitStatus({ state: 'success' }), false);
  assert.equal(shouldReviewCommitStatus({ state: 'failure' }), false);
  assert.equal(shouldReviewCommitStatus({ state: 'pending' }), true);
  assert.equal(shouldReviewCommitStatus(null), true);
});

test('checks out an existing PR head without claiming its local branch', () => {
  assert.deepEqual(
    buildWorktreeAddArgs('/tmp/JAL-55', 'origin/codex/JAL-47-p0'),
    ['worktree', 'add', '--force', '--detach', '/tmp/JAL-55', 'origin/codex/JAL-47-p0'],
  );
});

function jiraWith(issue, parent = issue) {
  const transitions = [];
  return {
    transitions,
    getIssue: async (key) => key === issue.fields.parent?.key ? parent : issue,
    transitionIssue: async (key, status) => transitions.push([key, status]),
  };
}

test('processIssue verifies an existing merged PR and Jira Done before success', async () => {
  const issue = {
    key: 'JAL-47',
    fields: { summary: 'blocker', labels: ['pr-16'], status: { name: '해야 할 일' } },
  };
  const jira = jiraWith(issue);
  jira.getIssue = async () => ({ ...issue, fields: { ...issue.fields, status: { name: '완료' } } });
  const github = { getPullRequest: async () => ({ number: 16, state: 'MERGED', mergedAt: '2026-08-12' }) };
  assert.equal(await processIssue({ jira, github, config, issue, dryRun: false }), true);
  assert.deepEqual(jira.transitions, [['JAL-47', '완료']]);
});

test('processIssue does not claim success when a parent needs human review', async () => {
  const issue = {
    key: 'JAL-48',
    fields: { parent: { key: 'JAL-47' }, summary: 'child', labels: [], status: { name: '해야 할 일' } },
  };
  const parent = { key: 'JAL-47', fields: { status: { name: '사람 확인 필요' } } };
  const jira = jiraWith(issue, parent);
  assert.equal(await processIssue({ jira, github: {}, config, issue, dryRun: false }), false);
  assert.deepEqual(jira.transitions, [['JAL-48', '사람 확인 필요']]);
});

test('processIssue requires a merged PR when a completed parent closes its subtask', async () => {
  const issue = {
    key: 'JAL-48',
    fields: {
      parent: { key: 'JAL-47' }, summary: 'child', labels: ['pr-16'], status: { name: '해야 할 일' },
    },
  };
  const parent = { key: 'JAL-47', fields: { status: { name: '완료' } } };
  const jira = jiraWith(issue, parent);
  jira.getIssue = async (key) => key === 'JAL-47'
    ? parent
    : { ...issue, fields: { ...issue.fields, status: { name: '완료' } } };
  const github = { getPullRequest: async () => ({ number: 16, state: 'OPEN' }) };
  assert.equal(await processIssue({ jira, github, config, issue, dryRun: false }), false);
});

test('processIssue uses a completed parent merged PR for a subtask without its own PR label', async () => {
  const issue = { key: 'JAL-48', fields: { parent: { key: 'JAL-47' }, summary: 'child', labels: [], status: { name: '해야 할 일' } } };
  const parent = { key: 'JAL-47', fields: { labels: ['pr-16'], status: { name: '완료' } } };
  const jira = jiraWith(issue, parent);
  jira.getIssue = async (key) => key === 'JAL-47' ? parent : { ...issue, fields: { ...issue.fields, status: { name: '완료' } } };
  const github = { getPullRequest: async () => ({ number: 16, state: 'MERGED' }) };
  assert.equal(await processIssue({ jira, github, config, issue, dryRun: false }), true);
});

test('processIssue contains PR lookup failures to the affected ticket', async () => {
  const issue = { key: 'JAL-47', fields: { summary: 'blocker', labels: ['pr-16'], status: { name: '해야 할 일' } } };
  const github = { getPullRequest: async () => { throw new Error('offline'); } };
  assert.equal(await processIssue({ jira: jiraWith(issue), github, config, issue, dryRun: false }), false);
});

test('processIssue dry-run is conservative for unprocessed work', async () => {
  const issue = {
    key: 'JAL-47',
    fields: { summary: 'blocker', labels: [], status: { name: '해야 할 일' } },
  };
  assert.equal(await processIssue({
    jira: jiraWith(issue), github: {}, config, issue, dryRun: true,
  }), false);
});

test('nightly completion status does not call an all-held queue successful', () => {
  assert.equal(classifyNightlyStatus([{ key: 'JAL-48', result: '보류' }]), '보류/지연');
  assert.equal(classifyNightlyStatus([], 2), '보류/지연');
  assert.equal(classifyNightlyStatus([{ key: 'JAL-47', result: '성공' }, { key: 'JAL-48', result: '보류' }], 2), '보류/지연');
  assert.equal(classifyNightlyStatus([{ key: 'JAL-47', result: '성공' }], 2), '보류/지연');
  assert.equal(classifyNightlyStatus([{ key: 'JAL-47', result: '성공' }]), '성공');
  assert.equal(classifyNightlyStatus([{ key: 'JAL-47', result: '실패/미병합' }]), '일부 실패');
});

test('captures the fixed plan snapshot and blocked queue before an empty actionable-plan return', () => {
  const summary = { plannedTickets: [], remainingQueue: [], verification: '처리 티켓 없음' };
  captureNightlyPlanSummary(summary, {
    issues: [], externallyBlockedKeys: ['JAL-47'], cyclicKeys: ['JAL-53'],
    counts: { total: 2 },
  });
  assert.deepEqual(summary.plannedTickets, []);
  assert.deepEqual(summary.remainingQueue, ['JAL-47', 'JAL-53']);
  assert.equal(summary.status, '보류/지연');
  assert.match(summary.verification, /큐 스냅샷 2건 확인/);
  assert.match(summary.nextAction, /JAL-47, JAL-53/);
});

test('labels only dry-runs or explicitly requested probes as test notifications', () => {
  assert.equal(isTestNotificationRun({ dryRun: true }), true);
  assert.equal(isTestNotificationRun({ dryRun: false, explicitTestNotification: true }), true);
  assert.equal(isTestNotificationRun({ dryRun: false }), false);
});

test('nightly lock contention leaves the existing owner lock untouched', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'nightly-lock-test-'));
  const path = resolve(root, 'nightly.lock');
  try {
    writeFileSync(path, 'existing-owner');
    assert.throws(
      () => acquireNightlyLock(path),
      (error) => error.code === 'QA_NIGHTLY_LOCKED' && /Another QA nightly runner is active/.test(error.message),
    );
    assert.equal(readFileSync(path, 'utf8'), 'existing-owner');
    rmSync(path);
    const descriptor = acquireNightlyLock(path);
    closeSync(descriptor);
    assert.equal(existsSync(path), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
