import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

for (const script of ['claude-review.mjs', 'replay.mjs']) {
  test(`${script} enters its CLI branch from a non-ASCII repository path`, () => {
    const result = spawnSync(process.execPath, [`qa/automation/${script}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage:/);
  });
}
