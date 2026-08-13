import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLaunchAgentPlist, resolveClaudeExecutable, resolveOpenClawExecutable, validateScheduleConfig } from './install-schedule.mjs';

test('requires the Telegram destination before schedule installation', () => {
  assert.throws(() => validateScheduleConfig({}), /QA_TELEGRAM_TARGET/);
  assert.doesNotThrow(() => validateScheduleConfig({ telegramTarget: '-5376954524' }));
});

test('scheduled agents enter through the main-activating operational launcher', () => {
  const plist = buildLaunchAgentPlist({
    label: 'test',
    scriptPath: '/automation/operational-entrypoint.mjs',
    scriptArguments: ['nightly-runner.mjs'],
    workingDirectory: '/automation',
    hour: 0,
    minute: 30,
    stdoutPath: '/tmp/out',
    stderrPath: '/tmp/err',
    nodeExecutable: '/node',
    claudeExecutable: '/claude',
    openclawExecutable: '/openclaw',
  });
  assert.match(plist, /operational-entrypoint\.mjs/);
  assert.match(plist, /nightly-runner\.mjs/);
});

test('CLI resolution uses the first existing stable candidate and otherwise fails fast', () => {
  const exists = (path) => path === '/second';
  assert.equal(resolveClaudeExecutable(exists, ['/first', '/second']), '/second');
  assert.equal(resolveOpenClawExecutable(exists, ['/first', '/second']), '/second');
  assert.throws(() => resolveClaudeExecutable(() => false, ['/missing']), /current Claude CLI/);
  assert.throws(() => resolveOpenClawExecutable(() => false, ['/missing']), /OpenClaw CLI/);
});
