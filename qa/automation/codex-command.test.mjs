import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { runCodexCommand } from './codex-command.mjs';

test('runs Codex with an explicit noninteractive approval policy', async (context) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'jalsarabose-codex-command-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const executable = resolve(directory, 'fake-codex');
  const capturedArgs = resolve(directory, 'args.json');

  writeFileSync(
    executable,
    `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(capturedArgs)}, JSON.stringify(process.argv.slice(2)));\n`,
  );
  chmodSync(executable, 0o700);

  await runCodexCommand({
    codexPath: executable,
    worktree: directory,
    schemaPath: resolve(directory, 'schema.json'),
    resultPath: resolve(directory, 'result.json'),
    prompt: 'Fix the ticket.',
  });

  const args = JSON.parse(readFileSync(capturedArgs, 'utf8'));
  assert.deepEqual(args.slice(0, 7), [
    'exec',
    '-C',
    directory,
    '-s',
    'workspace-write',
    '-c',
    'approval_policy="never"',
  ]);
  assert.equal(args.includes('-a'), false);
  assert.equal(args.includes('--ask-for-approval'), false);
});
