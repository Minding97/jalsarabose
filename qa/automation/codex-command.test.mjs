import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { buildCodexEnvironment, buildCodexExecArgs, runCodexCommand } from './codex-command.mjs';

test('supports an explicit sandbox override', () => {
  const args = buildCodexExecArgs({ worktree: '/tmp/w', schemaPath: '/tmp/s', resultPath: '/tmp/r', prompt: 'review', sandbox: 'read-only' });
  assert.deepEqual(args.slice(3, 5), ['-s', 'read-only']);
});

test('drops an inherited agent-specific CODEX_HOME', () => {
  assert.deepEqual(
    buildCodexEnvironment({
      HOME: '/Users/operator',
      CODEX_HOME: '/isolated/agent/codex-home',
      PATH: '/usr/bin:/bin',
    }),
    {
      HOME: '/Users/operator',
      PATH: '/usr/bin:/bin',
    },
  );
});

test('runs Codex with an explicit noninteractive approval policy', async (context) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'jalsarabose-codex-command-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const executable = resolve(directory, 'fake-codex');
  const capturedArgs = resolve(directory, 'args.json');
  const capturedEnvironment = resolve(directory, 'environment.json');

  writeFileSync(
    executable,
    `#!/usr/bin/env node\nconst fs = require('node:fs');\nfs.writeFileSync(${JSON.stringify(capturedArgs)}, JSON.stringify(process.argv.slice(2)));\nfs.writeFileSync(${JSON.stringify(capturedEnvironment)}, JSON.stringify({ codexHomePresent: Object.hasOwn(process.env, 'CODEX_HOME'), home: process.env.HOME }));\n`,
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
  const environment = JSON.parse(readFileSync(capturedEnvironment, 'utf8'));
  assert.deepEqual(environment, {
    codexHomePresent: false,
    home: process.env.HOME,
  });
});
