import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { formatAutomationSummary, isTestNotificationRun, notifyAutomationSummary, sanitizeNotificationFailure } from './notification.mjs';

test('formats a concise nightly completion report with tickets, gates, queue, and next action', () => {
  const text = formatAutomationSummary({
    kind: 'nightly', status: '후속 작업 있음', startedAt: 'start', completedAt: 'end',
    plannedTickets: ['JAL-47', 'JAL-53'],
    ticketResults: [
      { key: 'JAL-47', result: '완료', reason: 'PR #17 병합 완료' },
      { key: 'JAL-53', result: '리뷰 반영 예정', reason: 'PR #18 리뷰 후속 티켓 처리 대기' },
    ],
    pullRequests: ['#17 병합 완료', '#18 병합 대기'], verification: '처리 단계 2/2건 확인 · 완료 1건', failures: [],
    remainingQueue: ['JAL-53'], nextAction: '리뷰 재시도',
  });
  assert.match(text, /JAL-47=완료/);
  assert.match(text, /JAL-53=리뷰 반영 예정/);
  assert.match(text, /JAL-53=리뷰 반영 예정 \(PR #18 리뷰 후속 티켓 처리 대기\)/);
  assert.match(text, /실제 실패: 없음/);
  assert.match(text, /#18 병합 대기/);
  assert.match(text, /남은 큐: JAL-53/);
  assert.match(text, /다음 조치: 리뷰 재시도/);
});

test('lists only genuine implementation or test failures in the failure line', () => {
  const text = formatAutomationSummary({
    kind: 'nightly', status: '구현/테스트 실패 있음', startedAt: 'start', completedAt: 'end',
    plannedTickets: ['JAL-1', 'JAL-2'],
    ticketResults: [
      { key: 'JAL-1', result: '병합 대기', category: 'pending', reason: 'PR #1 승인 대기' },
      { key: 'JAL-2', result: '구현/테스트 실패', category: 'failure', reason: 'npm run verify failed' },
    ],
    pullRequests: ['#1 병합 대기'], failures: [], remainingQueue: ['JAL-1', 'JAL-2'],
  });
  assert.match(text, /실제 실패: JAL-2=구현\/테스트 실패/);
  assert.match(text, /npm run verify failed/);
  assert.doesNotMatch(text, /실제 실패: .*JAL-1/);
});

test('includes a short reason for every pending ticket in completion notifications', () => {
  const text = formatAutomationSummary({
    kind: 'nightly', status: '후속 작업 있음', startedAt: 'start', completedAt: 'end',
    plannedTickets: ['JAL-58', 'JAL-59'],
    ticketResults: [
      { key: 'JAL-58', result: '재작업 예정', category: 'pending', reason: 'PR #17 merge conflict' },
      { key: 'JAL-59', result: '병합 대기', category: 'pending', reason: 'PR #17 승인 대기' },
    ],
    pullRequests: ['#17 병합 대기'], failures: [], remainingQueue: ['JAL-58', 'JAL-59'],
  });
  assert.match(text, /JAL-58=재작업 예정 \(PR #17 merge conflict\)/);
  assert.match(text, /JAL-59=병합 대기 \(PR #17 승인 대기\)/);
});

test('labels manual verification notifications as test messages, never scheduled completions', () => {
  const text = formatAutomationSummary({
    kind: 'nightly', testNotification: true, status: '성공', startedAt: 'start', completedAt: 'end',
    plannedTickets: [], ticketResults: [], pullRequests: [], remainingQueue: [],
  });
  assert.match(text, /^🧪 시험 알림 · 🌙 야간 개발 완료/);
  assert.doesNotMatch(text, /^🌙 야간 개발 완료/);
});

test('does not infer a test notification from force or once production rerun flags', () => {
  assert.equal(isTestNotificationRun({ dryRun: false, force: true, once: true }), false);
  assert.equal(isTestNotificationRun({ dryRun: true, force: true }), true);
  assert.equal(isTestNotificationRun({ dryRun: false, explicitTestNotification: true }), true);
});

test('redacts secrets from notification text', () => {
  const text = formatAutomationSummary({ kind: 'daily', status: '실패', startedAt: 'start', completedAt: 'end', failures: ['Authorization: Bearer abc.def.ghi'], remainingQueue: [] });
  assert.doesNotMatch(text, /abc\.def\.ghi/);
});

test('removes upstream URLs, local paths, and long opaque values from failure summaries', () => {
  const safe = sanitizeNotificationFailure('Jira failed https://internal.example/path?email=user@example.com at /Users/me/project token abcdefghijklmnopqrstuvwxyz123456');
  assert.doesNotMatch(safe, /internal\.example|user@example\.com|\/Users\/me|abcdefghijklmnopqrstuvwxyz/);
});

test('removes configured short credentials and bare account emails from failure summaries', () => {
  const text = formatAutomationSummary(
    { kind: 'daily', status: '실패', startedAt: 'start', completedAt: 'end', failures: ['Jira response for qa@example.com: short-pass'] },
    ['qa@example.com', 'short-pass'],
  );
  assert.doesNotMatch(text, /qa@example\.com|short-pass/);
});

test('removes arbitrary unconfigured email addresses from failure summaries', () => {
  assert.equal(sanitizeNotificationFailure('Jira mentioned outsider@example.org'), 'Jira mentioned [EMAIL]');
});

test('fails closed when the required Telegram destination is not configured', async () => {
  await assert.rejects(
    notifyAutomationSummary({ config: {}, dryRun: true, summary: { kind: 'daily' } }),
    /QA_TELEGRAM_TARGET is required/,
  );
});

test('records a successful delivery even when the state directory does not exist yet', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'qa-notification-test-'));
  const cli = resolve(root, 'openclaw');
  const statePath = resolve(root, 'new/state/delivery.json');
  writeFileSync(cli, `#!/bin/sh\nprintf '{"ok":true}'\n`);
  chmodSync(cli, 0o755);
  try {
    await notifyAutomationSummary({
      config: { telegramTarget: '-5376954524', openclawCliPath: cli },
      summary: { kind: 'daily', runId: 'daily-test', startedAt: 'start', completedAt: 'end', status: '성공' },
      statePath,
    });
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.equal(state.runId, 'daily-test');
    assert.equal(state.target, '-5376954524');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
