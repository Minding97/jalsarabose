import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNightlyPlan,
  canRunTogether,
  executePlannedIssue,
  isVerifiedCompletion,
  reportNightlyPlan,
  resolveExternalDependencies,
  unsatisfiedDependencies,
} from './nightly-plan.mjs';

const config = { jiraBugType: 'Bug', jiraTaskType: 'Task', nightlyPlanWebhookUrl: '', nightlyPlanCommand: '' };
const issue = (key, type, priority, created, links = []) => ({ key, fields: { summary: key, issuetype: { name: type }, priority: { name: priority }, created, issuelinks: links } });

test('builds a fixed dependency-first plan, then priority and creation order', () => {
  const blocked = issue('JAL-3', 'Bug', 'Highest', '2026-01-01', [{ type: { inward: 'is blocked by', outward: 'blocks' }, outwardIssue: { key: 'JAL-1' } }]);
  const plan = buildNightlyPlan([
    blocked,
    issue('JAL-2', 'Task', 'High', '2026-01-02'),
    issue('JAL-1', 'Task', 'Low', '2026-01-03'),
  ], config);
  assert.deepEqual(plan.issues.map(({ key }) => key), ['JAL-2', 'JAL-1', 'JAL-3']);
  assert.deepEqual(plan.counts, { total: 3, task: 2, bug: 1, other: 0 });
  assert.match(plan.text, /전체 3건 · Task 2건 · Bug 1건/);
});

test('excludes dependency cycles while retaining unrelated work', () => {
  const link = (key) => [{ type: { inward: 'is blocked by', outward: 'blocks' }, outwardIssue: { key } }];
  const plan = buildNightlyPlan([
    issue('JAL-1', 'Task', 'High', '2026-01-01', link('JAL-2')),
    issue('JAL-2', 'Bug', 'High', '2026-01-01', link('JAL-1')),
    issue('JAL-3', 'Task', 'Low', '2026-01-02'),
  ], config);
  assert.deepEqual(plan.issues.map(({ key }) => key), ['JAL-3']);
  assert.deepEqual(plan.cyclicKeys, ['JAL-1', 'JAL-2']);
});

test('reports to Jira without invoking fallback', async () => {
  const comments = [];
  const plan = buildNightlyPlan([issue('JAL-1', 'Task', 'High', '2026-01-01')], config);
  const channel = await reportNightlyPlan({ jira: { addComment: async (...args) => comments.push(args) }, plan, config });
  assert.equal(channel, 'jira');
  assert.equal(comments.length, 1);
});

test('Jira ticket comments do not disclose unrelated ticket summaries', async () => {
  const comments = [];
  const plan = buildNightlyPlan([
    issue('JAL-1', 'Task', 'High', '2026-01-01'),
    issue('JAL-2', 'Bug', 'Low', '2026-01-02'),
  ], config);
  await reportNightlyPlan({ jira: { addComment: async (...args) => comments.push(args) }, plan, config });
  assert.doesNotMatch(comments.find(([key]) => key === 'JAL-1')[1], /JAL-2/);
  assert.doesNotMatch(comments.find(([key]) => key === 'JAL-2')[1], /JAL-1/);
});

test('holds a ticket whose blocker is outside the ready queue', () => {
  const blocked = issue('JAL-2', 'Task', 'High', '2026-01-01', [
    { type: { inward: 'is blocked by', outward: 'blocks' }, outwardIssue: { key: 'JAL-1' } },
  ]);
  const plan = buildNightlyPlan([blocked], config);
  assert.deepEqual(plan.issues, []);
  assert.deepEqual(plan.externallyBlockedKeys, ['JAL-2']);
  assert.match(plan.ticketTexts.get('JAL-2'), /보류/);
});

test('admits JAL-54 when batched Jira and cached PR lookup verify external JAL-53', async () => {
  const downstream = issue('JAL-54', 'Task', 'High', '2026-01-01', [
    { type: { inward: 'is blocked by' }, outwardIssue: { key: 'JAL-53' } },
  ]);
  let jiraCalls = 0; let githubCalls = 0;
  const external = await resolveExternalDependencies({
    issues: [downstream], doneStatus: '완료',
    jira: { getIssues: async () => { jiraCalls += 1; return [{ key: 'JAL-53', fields: { status: { name: '완료' }, labels: ['pr-18'] } }]; } },
    github: { getPullRequest: async () => { githubCalls += 1; return { state: 'MERGED' }; } },
  });
  const plan = buildNightlyPlan([downstream], config, external);
  assert.deepEqual(plan.issues.map(({ key }) => key), ['JAL-54']);
  assert.equal(jiraCalls, 1); assert.equal(githubCalls, 1);
});

test('fails closed with a concrete reason when external Jira lookup fails', async () => {
  const downstream = issue('JAL-54', 'Task', 'High', '2026-01-01', [
    { type: { inward: 'is blocked by' }, outwardIssue: { key: 'JAL-53' } },
  ]);
  const external = await resolveExternalDependencies({ issues: [downstream], doneStatus: '완료', jira: { getIssues: async () => { throw new Error('timeout'); } }, github: {} });
  assert.match(external.failures.get('JAL-53'), /timeout/);
  assert.deepEqual(buildNightlyPlan([downstream], config, external).issues, []);
});

test('deduplicates parent/review tickets sharing a PR and serializes conflicts', () => {
  const parent = { ...issue('JAL-47', 'Task', 'High', '2026-01-01'), fields: { ...issue('x','Task','High','').fields, labels: ['pr-17'] } };
  const review = { ...issue('JAL-56', 'Task', 'Low', '2026-01-02'), fields: { ...issue('x','Task','Low','').fields, labels: ['pr-17'], parent: { key: 'JAL-47' } } };
  const independent = issue('JAL-60', 'Task', 'Low', '2026-01-03');
  const plan = buildNightlyPlan([parent, review, independent], config);
  assert.deepEqual(plan.issues.map(({ key }) => key), ['JAL-47', 'JAL-60']);
  assert.deepEqual(plan.duplicateKeys, ['JAL-56']);
  assert.equal(canRunTogether(parent, review, plan), false);
  assert.equal(canRunTogether(parent, independent, plan), true);
});

test('holds downstream after an unsuccessful blocker while independent work remains runnable', () => {
  const link = (key) => [{ type: { inward: 'is blocked by', outward: 'blocks' }, outwardIssue: { key } }];
  const plan = buildNightlyPlan([
    issue('JAL-47', 'Task', 'High', '2026-01-01'),
    issue('JAL-48', 'Task', 'High', '2026-01-02', link('JAL-47')),
    issue('JAL-53', 'Task', 'Low', '2026-01-03'),
  ], config);
  const successful = new Set();
  assert.deepEqual(unsatisfiedDependencies(plan, 'JAL-48', successful), ['JAL-47']);
  assert.deepEqual(unsatisfiedDependencies(plan, 'JAL-53', successful), []);
  successful.add('JAL-47');
  assert.deepEqual(unsatisfiedDependencies(plan, 'JAL-48', successful), []);
  assert.match(plan.text, /Jira 완료 상태이고 PR merge까지 확인/);
});

test('executes only dependency-satisfied tickets and records verified successes', async () => {
  const link = (key) => [{ type: { inward: 'is blocked by', outward: 'blocks' }, outwardIssue: { key } }];
  const blocker = issue('JAL-47', 'Task', 'High', '2026-01-01');
  const downstream = issue('JAL-48', 'Task', 'High', '2026-01-02', link('JAL-47'));
  const independent = issue('JAL-53', 'Task', 'Low', '2026-01-03');
  const plan = buildNightlyPlan([blocker, downstream, independent], config);
  const successfulKeys = new Set();
  const processed = [];
  const held = [];
  const execute = (plannedIssue) => executePlannedIssue({
    plan,
    issue: plannedIssue,
    successfulKeys,
    processIssue: async ({ key }) => { processed.push(key); return key === 'JAL-53'; },
    holdIssue: async ({ key }, blockers) => held.push([key, blockers]),
  });

  await execute(blocker);
  await execute(downstream);
  await execute(independent);
  assert.deepEqual(processed, ['JAL-47', 'JAL-53']);
  assert.deepEqual(held, [['JAL-48', ['JAL-47']]]);
  assert.deepEqual([...successfulKeys], ['JAL-53']);
});

test('trusts completion only when Jira is done and GitHub reports the PR merged', () => {
  const done = { fields: { status: { name: '완료' } } };
  const open = { fields: { status: { name: '코드 리뷰' } } };
  assert.equal(isVerifiedCompletion(done, { state: 'MERGED' }, '완료'), true);
  assert.equal(isVerifiedCompletion(done, { state: 'OPEN' }, '완료'), false);
  assert.equal(isVerifiedCompletion(open, { state: 'MERGED' }, '완료'), false);
});

test('does not treat a Jira blocker as depending on the ticket it blocks', () => {
  const blocker = issue('JAL-1', 'Task', 'High', '2026-01-01', [
    { type: { inward: 'is blocked by', outward: 'blocks' }, inwardIssue: { key: 'JAL-2' } },
  ]);
  const plan = buildNightlyPlan([blocker], config);
  assert.deepEqual(plan.issues.map(({ key }) => key), ['JAL-1']);
  assert.deepEqual(plan.externallyBlockedKeys, []);
});

test('uses configured webhook when Jira reporting fails', async () => {
  const plan = buildNightlyPlan([issue('JAL-1', 'Unknown', 'High', '2026-01-01')], config);
  let payload;
  const channel = await reportNightlyPlan({
    jira: { addComment: async () => { throw new Error('offline'); } }, plan,
    config: { ...config, nightlyPlanWebhookUrl: 'https://example.invalid/hook' },
    fetchImpl: async (_url, init) => { payload = JSON.parse(init.body); return { ok: true }; },
  });
  assert.equal(channel, 'webhook');
  assert.match(payload.text, /JAL-1/);
});

test('fallback reports only Jira tickets whose scoped comment failed', async () => {
  const plan = buildNightlyPlan([
    issue('JAL-1', 'Task', 'High', '2026-01-01'),
    issue('JAL-2', 'Task', 'Low', '2026-01-02'),
  ], config);
  let payload;
  const channel = await reportNightlyPlan({
    jira: { addComment: async (key) => { if (key === 'JAL-2') throw new Error('denied'); } },
    plan,
    config: { ...config, nightlyPlanWebhookUrl: 'https://example.invalid/hook' },
    fetchImpl: async (_url, init) => { payload = JSON.parse(init.body); return { ok: true }; },
  });
  assert.equal(channel, 'webhook');
  assert.match(payload.text, /JAL-2/);
  assert.doesNotMatch(payload.text, /JAL-1/);
});
