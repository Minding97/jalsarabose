import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('node_modules is ignored and absent from the tracked tree', () => {
  const tracked = spawnSync('git', ['ls-files', '--', 'node_modules'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  const ignoreRules = readFileSync(resolve(repositoryRoot, '.gitignore'), 'utf8');

  assert.equal(tracked.status, 0, tracked.stderr);
  assert.equal(tracked.stdout, '');
  assert.match(ignoreRules, /^node_modules\/$/m, 'node_modules must remain covered by .gitignore');
});
