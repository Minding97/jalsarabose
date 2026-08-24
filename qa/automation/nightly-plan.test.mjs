import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNightlyPlan,
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

test('caps the fixed nightly plan and reports overflow for the next run', () => {
  const plan = buildNightlyPlan([
    issue('JAL-1', 'Task', 'High', '2026-01-01'), issue('JAL-2', 'Task', 'High', '2026-01-02'),
    issue('JAL-3', 'Task', 'High', '2026-01-03'),
  ], { ...config, nightlyMaxTickets: 2 });
  assert.deepEqual(plan.issues.map(({ key }) => key), ['JAL-1', 'JAL-2']);
  assert.deepEqual(plan.cappedKeys, ['JAL-3']);
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

test('plan to execute handoff accepts a Jira-done and merged external dependency', async () => {
  const downstream = issue('JAL-54', 'Task', 'High', '2026-01-01', [
    { type: { inward: 'is blocked by' }, outwardIssue: { key: 'JAL-53' } },
  ]);
  const external = await resolveExternalDependencies({
    issues: [downstream],
    doneStatus: '완료',
    jira: { getIssue: async () => ({ key: 'JAL-53', fields: { status: { name: '완료' }, labels: ['pr-18'] } }) },
    github: { getPullRequest: async () => ({ state: 'MERGED' }) },
  });
  const plan = buildNightlyPlan([downstream], config, external);
  const heldWithNoHandoff = await executePlannedIssue({
    plan, issue: downstream, successfulKeys: new Set(),
    processIssue: async () => assert.fail('external dependency was not handed to execution'),
    holdIssue: async () => {},
  });
  assert.deepEqual(heldWithNoHandoff, { held: true, succeeded: false, blockers: ['JAL-53'] });
  let processed = false;
  const result = await executePlannedIssue({
    plan,
    issue: downstream,
    successfulKeys: new Set(plan.externallySatisfiedKeys),
    processIssue: async () => { processed = true; return true; },
    holdIssue: async () => assert.fail('verified external dependency must not be held'),
  });
  assert.equal(processed, true);
  assert.deepEqual(result, { held: false, succeeded: true });
});

test('external dependency failure reports the actual Jira reason', async () => {
  const downstream = issue('JAL-54', 'Task', 'High', '2026-01-01', [
    { type: { inward: 'is blocked by' }, outwardIssue: { key: 'JAL-53' } },
  ]);
  const external = await resolveExternalDependencies({
    issues: [downstream], doneStatus: '완료',
    jira: { getIssue: async () => { throw new Error('offline'); } }, github: {},
  });
  const plan = buildNightlyPlan([downstream], config, external);
  assert.deepEqual(plan.issues, []);
  assert.match(plan.ticketTexts.get('JAL-54'), /Jira 상태 조회 실패/);
  assert.doesNotMatch(plan.ticketTexts.get('JAL-54'), /완료\/병합 미확인/);
});

test('external dependency validation fails closed for every incomplete verification branch', async (t) => {
  const downstream = issue('JAL-54', 'Task', 'High', '2026-01-01', [
    { type: { inward: 'is blocked by' }, outwardIssue: { key: 'JAL-53' } },
  ]);
  const cases = [
    ['Jira not done', { status: { name: '진행 중' }, labels: ['pr-18'] }, async () => ({ state: 'MERGED' }), /Jira 상태가 완료가 아님/],
    ['missing PR label', { status: { name: '완료' }, labels: [] }, async () => ({ state: 'MERGED' }), /연결 PR을 확인할 수 없음/],
    ['PR not merged', { status: { name: '완료' }, labels: ['pr-18'] }, async () => ({ state: 'OPEN' }), /병합되지 않음/],
    ['GitHub lookup error', { status: { name: '완료' }, labels: ['pr-18'] }, async () => { throw new Error('offline'); }, /상태 조회 실패/],
  ];
  for (const [name, fields, getPullRequest, reason] of cases) {
    await t.test(name, async () => {
      const external = await resolveExternalDependencies({
        issues: [downstream], doneStatus: '완료',
        jira: { getIssue: async () => ({ key: 'JAL-53', fields }) },
        github: { getPullRequest },
      });
      assert.equal(external.satisfiedKeys.has('JAL-53'), false);
      assert.match(external.failureReasons.get('JAL-53'), reason);
    });
  }
});

test('ticket comment lists every unresolved external dependency', async () => {
  const downstream = issue('JAL-54', 'Task', 'High', '2026-01-01', [
    { type: { inward: 'is blocked by' }, outwardIssue: { key: 'JAL-48' } },
    { type: { inward: 'is blocked by' }, outwardIssue: { key: 'JAL-53' } },
  ]);
  const external = {
    satisfiedKeys: new Set(),
    failureReasons: new Map([['JAL-48', '선행 JAL-48 미완료'], ['JAL-53', '선행 JAL-53 PR 미병합']]),
  };
  const plan = buildNightlyPlan([downstream], config, external);
  assert.match(plan.ticketTexts.get('JAL-54'), /선행 JAL-48 미완료; 선행 JAL-53 PR 미병합/);
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
