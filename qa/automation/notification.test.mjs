import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { formatAutomationSummary, notifyAutomationSummary, sanitizeNotificationFailure } from './notification.mjs';

test('formats a concise nightly completion report with tickets, gates, queue, and next action', () => {
  const text = formatAutomationSummary({
    kind: 'nightly', status: '일부 실패', startedAt: 'start', completedAt: 'end',
    plannedTickets: ['JAL-47', 'JAL-53'],
    ticketResults: [{ key: 'JAL-47', result: '성공' }, { key: 'JAL-53', result: '실패/미병합' }],
    pullRequests: ['#17 merged', '#18 대기'], verification: '1/2 완료', failures: ['JAL-53 review'],
    remainingQueue: ['JAL-53'], nextAction: '리뷰 재시도',
  });
  assert.match(text, /JAL-47=성공/);
  assert.match(text, /#18 대기/);
  assert.match(text, /남은 큐: JAL-53/);
  assert.match(text, /다음 조치: 리뷰 재시도/);
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
