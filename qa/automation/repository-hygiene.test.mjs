import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('repository ignore rules exclude a root node_modules symlink', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'repository-hygiene-test-'));
  const repository = resolve(root, 'repository');
  const dependencyCache = resolve(root, 'dependency-cache');

  try {
    mkdirSync(repository);
    mkdirSync(dependencyCache);
    copyFileSync(resolve(repositoryRoot, '.gitignore'), resolve(repository, '.gitignore'));
    execFileSync('git', ['init', '--quiet'], { cwd: repository });
    symlinkSync(dependencyCache, resolve(repository, 'node_modules'), 'dir');

    const result = spawnSync('git', ['check-ignore', '--quiet', 'node_modules'], {
      cwd: repository,
      shell: false,
    });

    assert.equal(result.status, 0, 'node_modules symlinks must be ignored by git add -A');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
