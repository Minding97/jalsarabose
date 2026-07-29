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
