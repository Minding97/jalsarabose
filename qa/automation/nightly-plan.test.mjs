import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNightlyPlan, reportNightlyPlan } from './nightly-plan.mjs';

const config = { jiraBugType: 'Bug', jiraTaskType: 'Task', nightlyPlanWebhookUrl: '', nightlyPlanCommand: '' };
const issue = (key, type, priority, created, links = []) => ({ key, fields: { summary: key, issuetype: { name: type }, priority: { name: priority }, created, issuelinks: links } });

test('builds a fixed dependency-first plan, then priority and creation order', () => {
  const blocked = issue('JAL-3', 'Bug', 'Highest', '2026-01-01', [{ type: { inward: 'is blocked by' }, inwardIssue: { key: 'JAL-1' } }]);
  const plan = buildNightlyPlan([
    blocked,
    issue('JAL-2', 'Task', 'High', '2026-01-02'),
    issue('JAL-1', 'Task', 'Low', '2026-01-03'),
  ], config);
  assert.deepEqual(plan.issues.map(({ key }) => key), ['JAL-2', 'JAL-1', 'JAL-3']);
  assert.deepEqual(plan.counts, { total: 3, task: 2, bug: 1, other: 0 });
  assert.match(plan.text, /전체 3건 · Task 2건 · Bug 1건/);
});

test('rejects dependency cycles instead of running without a plan', () => {
  const link = (key) => [{ type: { inward: 'is blocked by' }, inwardIssue: { key } }];
  assert.throws(() => buildNightlyPlan([
    issue('JAL-1', 'Task', 'High', '2026-01-01', link('JAL-2')),
    issue('JAL-2', 'Bug', 'High', '2026-01-01', link('JAL-1')),
  ], config), /Dependency cycle/);
});

test('reports to Jira without invoking fallback', async () => {
  const comments = [];
  const plan = buildNightlyPlan([issue('JAL-1', 'Task', 'High', '2026-01-01')], config);
  const channel = await reportNightlyPlan({ jira: { addComment: async (...args) => comments.push(args) }, plan, config });
  assert.equal(channel, 'jira');
  assert.equal(comments.length, 1);
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
  assert.match(payload.text, /기타\/불명확 1건/);
});
