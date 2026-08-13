import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { buildStableNotificationRunId, formatAutomationSummary, isTestNotificationRun,
  notifyAutomationSummary, sanitizeNotificationFailure } from './notification.mjs';

test('formats a concise nightly completion report with tickets, gates, queue, and next action', () => {
  const text = formatAutomationSummary({
    kind: 'nightly', status: '일부 실패', startedAt: 'start', completedAt: 'end',
    plannedTickets: ['JAL-47', 'JAL-53'],
    ticketResults: [{ key: 'JAL-47', result: '성공' }, { key: 'JAL-53', result: '실패/미병합' }],
    pullRequests: ['#17 merged', '#18 대기'], verification: '1/2 완료', failures: ['JAL-53 review'],
    reviewGates: ['JAL-47=Claude primary review / PASS', 'JAL-53=Codex fallback review / BLOCKED'],
    remainingQueue: ['JAL-53'], nextAction: '리뷰 재시도',
  });
  assert.match(text, /JAL-47=성공/);
  assert.match(text, /#18 대기/);
  assert.match(text, /Codex fallback review \/ BLOCKED/);
  assert.match(text, /남은 큐: JAL-53/);
  assert.match(text, /다음 조치: 리뷰 재시도/);
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

test('uses one stable delivery ledger key across separate retries of a logical scheduled run', () => {
  assert.equal(buildStableNotificationRunId('nightly', '2026-08-13T00:30:00.000Z'), 'nightly-2026-08-13');
  assert.equal(buildStableNotificationRunId('nightly', '2026-08-13T06:59:59.000Z'), 'nightly-2026-08-13');
  assert.equal(buildStableNotificationRunId('daily', '2026-08-13T09:00:00.000Z'), 'daily-2026-08-13');
  assert.throws(() => buildStableNotificationRunId('other', '2026-08-13'), /supported kind/);
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
  const callsPath = resolve(root, 'calls');
  const statePath = resolve(root, 'new/state/delivery.json');
  writeFileSync(cli, `#!/bin/sh\nprintf x >> "${callsPath}"\nprintf '{"ok":true,"result":{"message_id":917}}'\n`);
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
    assert.equal(state.messageId, 917);
    assert.equal(state.status, 'delivered');
    await notifyAutomationSummary({
      config: { telegramTarget: '-5376954524', openclawCliPath: cli },
      summary: { kind: 'daily', runId: 'daily-test', startedAt: 'start', completedAt: 'end', status: '성공' },
      statePath,
    });
    assert.equal(JSON.parse(readFileSync(statePath, 'utf8')).messageId, 917);
    assert.equal(readFileSync(callsPath, 'utf8'), 'x');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
