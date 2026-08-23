import assert from 'node:assert/strict';
import { closeSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { acquireNightlyLock, buildWorktreeAddArgs, captureNightlyPlanSummary, classifyNightlyStatus, completeReviewFamily, prepareNightlyPlan, processIssue, reconcileMergedPullRequests, removeGeneratedWorktreeLinks, reportUnmergedReview, reportVerifiedCompletion } from './nightly-runner.mjs';
import { isTestNotificationRun } from './notification.mjs';

const config = {
  jiraDoneStatus: '완료',
  jiraNeedsHumanStatus: '사람 확인 필요',
};

test('reconcile fails closed unless merged, verify, and latest-head Claude gates all pass', async () => {
  const transitions = [];
  const issue = { key: 'JAL-47', fields: { labels: ['pr-17'], status: { name: '검토 중' } } };
  const jira = {
    searchIssuesByStatus: async () => [issue],
    transitionIssue: async (...args) => transitions.push(args),
    searchReviewChildren: async () => [],
  };
  await reconcileMergedPullRequests(jira, { getCompletionGate: async () => ({ complete: false, merged: true, verifySuccess: true, claudeSuccess: false }) }, { ...config, jiraReviewStatus: '검토 중' });
  assert.deepEqual(transitions, []);
  await reconcileMergedPullRequests(jira, { getCompletionGate: async () => ({ complete: true }) }, { ...config, jiraReviewStatus: '검토 중' });
  assert.deepEqual(transitions, [['JAL-47', '완료']]);
});

test('completion closes only review children of the exact parent and records idempotent evidence', async () => {
  const transitions = [];
  const comments = [];
  const jira = {
    searchReviewChildren: async () => [
      { key: 'JAL-56', fields: { parent: { key: 'JAL-47' }, status: { name: '검토 중' }, comment: { comments: [] } } },
      { key: 'JAL-X', fields: { parent: { key: 'JAL-99' }, status: { name: '검토 중' }, comment: { comments: [] } } },
    ],
    transitionIssue: async (...args) => transitions.push(args),
    addComment: async (...args) => comments.push(args),
  };
  await completeReviewFamily(jira, config, { key: 'JAL-47' }, 17);
  assert.deepEqual(transitions, [['JAL-56', '완료']]);
  assert.equal(comments.length, 1);
  assert.match(comments[0][1], /qa-review-family:JAL-47:pr-17/);
});

test('runner preparation carries verified external dependencies into execution state', async () => {
  const queueSnapshot = [{
    key: 'JAL-54',
    fields: {
      summary: 'downstream', issuetype: { name: 'Task' }, priority: { name: 'High' }, created: '2026-01-01',
      issuelinks: [{ type: { inward: 'is blocked by' }, outwardIssue: { key: 'JAL-53' } }],
    },
  }];
  const plan = await prepareNightlyPlan({
    queueSnapshot,
    config: { ...config, jiraBugType: 'Bug', jiraTaskType: 'Task' },
    jira: { getIssue: async () => ({ key: 'JAL-53', fields: { status: { name: '완료' }, labels: ['pr-18'] } }) },
    github: { getPullRequest: async () => ({ state: 'MERGED' }) },
  });
  assert.deepEqual(plan.issues.map(({ key }) => key), ['JAL-54']);
  assert.deepEqual([...plan.externallySatisfiedKeys], ['JAL-53']);
  assert.deepEqual(plan.dependencies.get('JAL-54'), ['JAL-53']);
});

test('checks out an existing PR head without claiming its local branch', () => {
  assert.deepEqual(
    buildWorktreeAddArgs('/tmp/JAL-55', 'origin/codex/JAL-47-p0'),
    ['worktree', 'add', '--force', '--detach', '/tmp/JAL-55', 'origin/codex/JAL-47-p0'],
  );
});

test('removes the generated node_modules symlink before staging a ticket', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'nightly-stage-test-'));
  const target = resolve(root, 'shared-node-modules');
  const worktree = resolve(root, 'worktree');
  mkdirSync(target);
  mkdirSync(worktree);
  symlinkSync(target, resolve(worktree, 'node_modules'), 'dir');

  removeGeneratedWorktreeLinks(worktree);

  assert.equal(existsSync(resolve(worktree, 'node_modules')), false);
  rmSync(root, { recursive: true, force: true });
});

test('preserves a real node_modules directory when preparing to stage a ticket', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'nightly-stage-directory-test-'));
  const worktree = resolve(root, 'worktree');
  mkdirSync(resolve(worktree, 'node_modules'), { recursive: true });
  writeFileSync(resolve(worktree, 'node_modules', 'sentinel'), 'keep');

  removeGeneratedWorktreeLinks(worktree);

  assert.equal(readFileSync(resolve(worktree, 'node_modules', 'sentinel'), 'utf8'), 'keep');
  rmSync(root, { recursive: true, force: true });
});

test('removes generated links after verification and before git add', () => {
  const source = readFileSync(new URL('./nightly-runner.mjs', import.meta.url), 'utf8');
  const verify = source.indexOf("await runCommand('npm', ['run', 'verify']");
  const remove = source.indexOf('removeGeneratedWorktreeLinks(worktree);', verify);
  const stage = source.indexOf("await runCommand('git', ['add', '-A']", remove);

  assert.ok(verify >= 0 && verify < remove && remove < stage);
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
  const failures = [];
  assert.equal(await processIssue({ jira, github: {}, config, issue, dryRun: false, reportFailure: (reason) => failures.push(reason) }), false);
  assert.deepEqual(jira.transitions, [['JAL-48', '사람 확인 필요']]);
  assert.deepEqual(failures, ['상위 티켓 JAL-47이 사람 확인 필요 상태']);
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
  const failures = [];
  assert.equal(await processIssue({ jira, github, config, issue, dryRun: false, reportFailure: (reason) => failures.push(reason) }), false);
  assert.deepEqual(failures, ['완료 검증 실패: Jira=완료, PR=OPEN']);
});

test('completion verification always reports the Jira and PR states when it fails', () => {
  const failures = [];
  assert.equal(reportVerifiedCompletion({
    issue: { fields: { status: { name: '검토 중' } } },
    pullRequest: { state: 'MERGED' },
    doneStatus: '완료',
    reportFailure: (reason) => failures.push(reason),
  }), false);
  assert.deepEqual(failures, ['완료 검증 실패: Jira=검토 중, PR=MERGED']);
});

test('an unmerged review reports the affected PR number', () => {
  const failures = [];
  reportUnmergedReview(40, (reason) => failures.push(reason));
  assert.deepEqual(failures, ['PR #40 리뷰 또는 병합 미완료']);
});

test('dry-run does not report false failures for already merged work', async () => {
  const issue = { key: 'JAL-47', fields: { summary: 'done', labels: ['pr-16'], status: { name: '해야 할 일' } } };
  const failures = [];
  assert.equal(await processIssue({
    jira: jiraWith(issue),
    github: { getPullRequest: async () => ({ number: 16, state: 'MERGED' }) },
    config,
    issue,
    dryRun: true,
    reportFailure: (reason) => failures.push(reason),
  }), false);
  assert.deepEqual(failures, []);
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
  const failures = [];
  assert.equal(await processIssue({ jira: jiraWith(issue), github, config, issue, dryRun: false, reportFailure: (reason) => failures.push(reason) }), false);
  assert.deepEqual(failures, ['PR 결과 조회 실패: offline']);
});

test('processIssue dry-run is conservative for unprocessed work', async () => {
  const issue = {
    key: 'JAL-47',
    fields: { summary: 'blocker', labels: [], status: { name: '해야 할 일' } },
  };
  const failures = [];
  assert.equal(await processIssue({
    jira: jiraWith(issue), github: {}, config, issue, dryRun: true, reportFailure: (reason) => failures.push(reason),
  }), false);
  assert.deepEqual(failures, []);
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
