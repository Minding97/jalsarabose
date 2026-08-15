import assert from 'node:assert/strict';
import { closeSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { acquireNightlyLock, buildWorktreeAddArgs, captureNightlyPlanSummary, classifyMergeStage, classifyNightlyStatus, finalizeNightlySummary, processIssue } from './nightly-runner.mjs';
import { isTestNotificationRun } from './notification.mjs';

const config = {
  jiraDoneStatus: '완료',
  jiraNeedsHumanStatus: '사람 확인 필요',
};

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
  assert.deepEqual(await processIssue({ jira, github, config, issue, dryRun: false }), { completed: true, result: '완료', category: 'complete', reason: '' });
  assert.deepEqual(jira.transitions, [['JAL-47', '완료']]);
});

test('processIssue does not claim success when a parent needs human review', async () => {
  const issue = {
    key: 'JAL-48',
    fields: { parent: { key: 'JAL-47' }, summary: 'child', labels: [], status: { name: '해야 할 일' } },
  };
  const parent = { key: 'JAL-47', fields: { status: { name: '사람 확인 필요' } } };
  const jira = jiraWith(issue, parent);
  assert.equal((await processIssue({ jira, github: {}, config, issue, dryRun: false })).result, '재작업 예정');
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
  assert.equal((await processIssue({ jira, github, config, issue, dryRun: false })).result, '병합 상태 확인 필요');
});

test('processIssue uses a completed parent merged PR for a subtask without its own PR label', async () => {
  const issue = { key: 'JAL-48', fields: { parent: { key: 'JAL-47' }, summary: 'child', labels: [], status: { name: '해야 할 일' } } };
  const parent = { key: 'JAL-47', fields: { labels: ['pr-16'], status: { name: '완료' } } };
  const jira = jiraWith(issue, parent);
  jira.getIssue = async (key) => key === 'JAL-47' ? parent : { ...issue, fields: { ...issue.fields, status: { name: '완료' } } };
  const github = { getPullRequest: async () => ({ number: 16, state: 'MERGED' }) };
  assert.equal((await processIssue({ jira, github, config, issue, dryRun: false })).result, '완료');
});

test('processIssue contains PR lookup failures to the affected ticket', async () => {
  const issue = { key: 'JAL-47', fields: { summary: 'blocker', labels: ['pr-16'], status: { name: '해야 할 일' } } };
  const github = { getPullRequest: async () => { throw new Error('offline'); } };
  assert.equal((await processIssue({ jira: jiraWith(issue), github, config, issue, dryRun: false })).result, '상태 확인 필요');
});

test('processIssue dry-run is conservative for unprocessed work', async () => {
  const issue = {
    key: 'JAL-47',
    fields: { summary: 'blocker', labels: [], status: { name: '해야 할 일' } },
  };
  assert.equal((await processIssue({
    jira: jiraWith(issue), github: {}, config, issue, dryRun: true,
  })).result, '실행 예정');
});

test('nightly completion status does not call an all-held queue successful', () => {
  assert.equal(classifyNightlyStatus([{ key: 'JAL-48', result: '선행 작업 대기', category: 'pending' }]), '후속 작업 있음');
  assert.equal(classifyNightlyStatus([], 2), '후속 작업 있음');
  assert.equal(classifyNightlyStatus([{ key: 'JAL-47', result: '완료' }, { key: 'JAL-48', result: '병합 대기' }], 2), '후속 작업 있음');
  assert.equal(classifyNightlyStatus([{ key: 'JAL-47', result: '완료' }], 2), '후속 작업 있음');
  assert.equal(classifyNightlyStatus([{ key: 'JAL-47', result: '완료' }]), '성공');
  assert.equal(classifyNightlyStatus([{ key: 'JAL-47', result: '구현/테스트 실패', category: 'failure' }]), '구현/테스트 실패 있음');
});

test('distinguishes merge conflicts from an ordinary merge wait', () => {
  assert.equal(classifyMergeStage({ state: 'OPEN', mergeStateStatus: 'DIRTY' }), '재작업 예정');
  assert.equal(classifyMergeStage({ state: 'OPEN', mergeStateStatus: 'BLOCKED' }), '병합 대기');
  assert.equal(classifyMergeStage({ state: 'MERGED', mergeStateStatus: 'CLEAN' }), '완료');
});

test('captures the fixed plan snapshot and blocked queue before an empty actionable-plan return', () => {
  const summary = { plannedTickets: [], remainingQueue: [], verification: '처리 티켓 없음' };
  captureNightlyPlanSummary(summary, {
    issues: [], externallyBlockedKeys: ['JAL-47'], cyclicKeys: ['JAL-53'],
    counts: { total: 2 },
  });
  assert.deepEqual(summary.plannedTickets, []);
  assert.deepEqual(summary.remainingQueue, ['JAL-47', 'JAL-53']);
  assert.equal(summary.status, '후속 작업 있음');
  assert.match(summary.verification, /큐 스냅샷 2건 확인/);
  assert.match(summary.nextAction, /JAL-47, JAL-53/);
});

test('waits for recovered review follow-ups before building the one final summary', async () => {
  const summary = {
    plannedTickets: [], ticketResults: [{ key: 'JAL-47', result: '리뷰 반영 예정', category: 'pending' }],
    pullRequests: ['#17 대기'], failures: [], remainingQueue: [], lateOutcomes: [],
  };
  const plan = { issues: [{ key: 'JAL-47' }], reportIssues: [{ key: 'JAL-47' }] };
  let reviewFinished = false;
  const jira = {
    searchReadyIssues: async () => {
      assert.equal(reviewFinished, true, 'final queue must be read after Claude/Jira recovery finishes');
      return [
        { key: 'JAL-55', fields: { summary: 'P2 first blocker' } },
        { key: 'JAL-56', fields: { summary: 'P2 second blocker' } },
      ];
    },
  };
  await Promise.resolve().then(() => { reviewFinished = true; });
  await finalizeNightlySummary({ summary, plan, jira });
  assert.deepEqual(summary.remainingQueue, ['JAL-55', 'JAL-56']);
  assert.deepEqual(summary.lateOutcomes, ['JAL-55=P2 first blocker', 'JAL-56=P2 second blocker']);
  assert.deepEqual(summary.failures, []);
  assert.match(summary.verification, /처리 단계 1\/1건 확인 · 완료 0건/);
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
