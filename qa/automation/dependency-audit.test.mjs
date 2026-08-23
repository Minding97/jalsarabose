import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = (path) => JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'));

test('xcode uses the patched CommonJS-compatible uuid release', () => {
  const packageJson = readJson('package.json');
  const packageLock = readJson('package-lock.json');
  const xcode = packageLock.packages['node_modules/xcode'];
  const uuid = packageLock.packages['node_modules/uuid'];

  assert.equal(xcode.version, '3.0.1');
  assert.equal(xcode.dependencies.uuid, '^7.0.3');
  assert.equal(packageJson.overrides?.xcode?.uuid, '11.1.1');
  assert.equal(uuid.version, '11.1.1');
  assert.equal(uuid.integrity, 'sha512-vIYxrBCC/N/K+Js3qSN88go7kIfNPssr/hHCesKCQNAjmgvYS2oqr69kIufEG+O4+PfezOH4EbIeHCfFov8ZgQ==');
});

test('the removed test runner cannot restore the reported esbuild path', () => {
  const packageJson = readJson('package.json');
  const packageLock = readJson('package-lock.json');

  assert.equal(packageJson.devDependencies.tsx, undefined);
  assert.equal(packageLock.packages['node_modules/tsx'], undefined);
  assert.equal(packageLock.packages['node_modules/esbuild'], undefined);
});
