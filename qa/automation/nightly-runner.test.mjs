import assert from 'node:assert/strict';
import { closeSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { acquireNightlyLock, captureNightlyPlanSummary, classifyNightlyStatus, finalizeNightlySummary, processIssue } from './nightly-runner.mjs';
import { isTestNotificationRun } from './notification.mjs';

const config = {
  jiraDoneStatus: '완료',
  jiraNeedsHumanStatus: '사람 확인 필요',
};

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

test('preserves blocked and cyclic ticket detail after the empty-plan final queue refresh', async () => {
  const summary = { plannedTickets: [], ticketResults: [], failures: [], remainingQueue: [], lateOutcomes: [] };
  const plan = { issues: [], reportIssues: [], externallyBlockedKeys: ['JAL-47'], cyclicKeys: ['JAL-53'], counts: { total: 2 } };
  captureNightlyPlanSummary(summary, plan);
  await finalizeNightlySummary({ summary, plan, jira: { searchReadyIssues: async () => [
    { key: 'JAL-47', fields: { summary: 'blocked' } }, { key: 'JAL-53', fields: { summary: 'cycle' } },
  ] } });
  assert.match(summary.nextAction, /JAL-47, JAL-53/);
});

test('waits for recovered review follow-ups before building the one final summary', async () => {
  const summary = {
    plannedTickets: [], ticketResults: [{ key: 'JAL-47', result: '실패/미병합' }],
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
  assert.match(summary.failures.join('\n'), /JAL-55/);
  assert.match(summary.failures.join('\n'), /JAL-56/);
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
