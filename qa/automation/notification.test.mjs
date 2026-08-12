import assert from 'node:assert/strict';
import test from 'node:test';

import { formatAutomationSummary, notifyAutomationSummary } from './notification.mjs';

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

test('fails closed when the required Telegram destination is not configured', async () => {
  await assert.rejects(
    notifyAutomationSummary({ config: {}, dryRun: true, summary: { kind: 'daily' } }),
    /QA_TELEGRAM_TARGET is required/,
  );
});
