import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveClaudeExecutable, resolveOpenClawExecutable, validateScheduleConfig } from './install-schedule.mjs';

test('requires the Telegram destination before schedule installation', () => {
  assert.throws(() => validateScheduleConfig({}), /QA_TELEGRAM_TARGET/);
  assert.doesNotThrow(() => validateScheduleConfig({ telegramTarget: '-5376954524' }));
});

test('CLI resolution uses the first existing stable candidate and otherwise fails fast', () => {
  const exists = (path) => path === '/second';
  assert.equal(resolveClaudeExecutable(exists, ['/first', '/second']), '/second');
  assert.equal(resolveOpenClawExecutable(exists, ['/first', '/second']), '/second');
  assert.throws(() => resolveClaudeExecutable(() => false, ['/missing']), /current Claude CLI/);
  assert.throws(() => resolveOpenClawExecutable(() => false, ['/missing']), /OpenClaw CLI/);
});
