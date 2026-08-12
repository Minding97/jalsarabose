import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNightlyPlan, reportNightlyPlan } from './nightly-plan.mjs';

const config = { jiraBugType: 'Bug', jiraTaskType: 'Task', nightlyPlanWebhookUrl: '', nightlyPlanCommand: '' };
const issue = (key, type, priority, created, links = []) => ({ key, fields: { summary: key, issuetype: { name: type }, priority: { name: priority }, created, issuelinks: links } });

test('builds a fixed dependency-first plan, then priority and creation order', () => {
  const blocked = issue('JAL-3', 'Bug', 'Highest', '2026-01-01', [{ type: { inward: 'is blocked by' }, outwardIssue: { key: 'JAL-1' } }]);
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
  const link = (key) => [{ type: { inward: 'is blocked by' }, outwardIssue: { key } }];
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
    { type: { inward: 'is blocked by' }, outwardIssue: { key: 'JAL-1' } },
  ]);
  const plan = buildNightlyPlan([blocked], config);
  assert.deepEqual(plan.issues, []);
  assert.deepEqual(plan.externallyBlockedKeys, ['JAL-2']);
  assert.match(plan.ticketTexts.get('JAL-2'), /보류/);
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
