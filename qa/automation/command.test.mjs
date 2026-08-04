import assert from 'node:assert/strict';
import test from 'node:test';

import { runCommand } from './command.mjs';

test('omits sensitive command output from failures', async () => {
  await assert.rejects(
    runCommand(
      process.execPath,
      ['-e', "process.stderr.write('test-password'); process.exit(1)"],
      { sensitive: true },
    ),
    (error) => {
      assert.equal(error.message.includes('test-password'), false);
      assert.equal(error.message.includes('Output omitted.'), true);
      return true;
    },
  );
});

test('terminates commands after their timeout', async () => {
  const result = await runCommand(
    process.execPath,
    ['-e', 'setTimeout(() => undefined, 10000)'],
    { timeoutMs: 25, allowFailure: true },
  );

  assert.equal(result.timedOut, true);
});

test('passes structured input to child commands', async () => {
  const result = await runCommand(
    process.execPath,
    ['-e', "process.stdin.on('data', (chunk) => process.stdout.write(chunk))"],
    { input: '{"ok":true}' },
  );

  assert.equal(result.stdout, '{"ok":true}');
});

test('can replace the inherited environment for isolated commands', async () => {
  const result = await runCommand(
    process.execPath,
    ['-e', "process.stdout.write(process.env.QA_TEST_PASSWORD || 'missing')"],
    {
      inheritEnv: false,
      env: { PATH: process.env.PATH },
    },
  );

  assert.equal(result.stdout, 'missing');
});

test('uses an empty environment when inheritance is disabled without replacements', async () => {
  const previousPassword = process.env.QA_TEST_PASSWORD;
  process.env.QA_TEST_PASSWORD = 'secret';

  try {
    const result = await runCommand(
      process.execPath,
      ['-e', "process.stdout.write(process.env.QA_TEST_PASSWORD || 'missing')"],
      { inheritEnv: false },
    );

    assert.equal(result.stdout, 'missing');
  } finally {
    if (previousPassword === undefined) delete process.env.QA_TEST_PASSWORD;
    else process.env.QA_TEST_PASSWORD = previousPassword;
  }
});

test('supports a larger capture budget for structured CLI responses', async () => {
  const payloadSize = 2.2 * 1024 * 1024;
  const result = await runCommand(
    process.execPath,
    ['-e', `process.stdout.write('start-' + 'x'.repeat(${payloadSize}) + '-end')`],
    { maxCaptureBytes: 3 * 1024 * 1024 },
  );

  assert.equal(result.stdout.startsWith('start-'), true);
  assert.equal(result.stdout.endsWith('-end'), true);
});
