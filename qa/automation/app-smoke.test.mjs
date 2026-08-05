import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  isCriticalConsoleError,
  isCriticalHttpResponse,
  isCriticalNetworkFailure,
  requiredEnvironment,
} from './app-smoke.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('requires every browser smoke environment value', () => {
  for (const name of ['QA_APP_URL', 'QA_TEST_EMAIL', 'QA_TEST_PASSWORD']) {
    assert.throws(
      () => requiredEnvironment(name, {}),
      new RegExp(`${name} is required`),
    );
  }
  assert.equal(requiredEnvironment('QA_APP_URL', { QA_APP_URL: ' http://localhost ' }), 'http://localhost');
});

test('app-smoke CLI fails fast before launching Chrome when configuration is missing', () => {
  const result = spawnSync(process.execPath, ['qa/automation/app-smoke.mjs'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '' },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /QA_APP_URL is required/);
});

test('fails on app errors but keeps benign or third-party console errors as diagnostics', () => {
  const appUrl = 'http://127.0.0.1:8091';
  assert.equal(
    isCriticalConsoleError(
      { text: 'TypeError: failed', sourceUrl: `${appUrl}/index.bundle` },
      appUrl,
    ),
    true,
  );
  assert.equal(
    isCriticalConsoleError(
      { text: 'Analytics summary failed', sourceUrl: `${appUrl}/index.bundle` },
      appUrl,
    ),
    true,
  );
  assert.equal(
    isCriticalConsoleError(
      { text: 'SDK error', sourceUrl: 'https://third-party.example/sdk.js' },
      appUrl,
    ),
    false,
  );
});

test('fails only for same-origin critical resource request failures', () => {
  const appUrl = 'http://127.0.0.1:8091';
  assert.equal(
    isCriticalNetworkFailure(
      { url: `${appUrl}/index.bundle`, resourceType: 'script', reason: 'net::ERR_FAILED' },
      appUrl,
    ),
    true,
  );
  assert.equal(
    isCriticalNetworkFailure(
      {
        url: 'https://analytics.example/collect',
        resourceType: 'fetch',
        reason: 'net::ERR_BLOCKED_BY_CLIENT',
      },
      appUrl,
    ),
    false,
  );
  assert.equal(
    isCriticalNetworkFailure(
      { url: `${appUrl}/image.png`, resourceType: 'image', reason: 'net::ERR_FAILED' },
      appUrl,
    ),
    false,
  );
});

test('fails on same-origin HTTP error responses for application resources', () => {
  const appUrl = 'http://127.0.0.1:8091';
  assert.equal(
    isCriticalHttpResponse(
      { url: `${appUrl}/api/data`, resourceType: 'fetch', status: 500 },
      appUrl,
    ),
    true,
  );
  assert.equal(
    isCriticalHttpResponse(
      { url: 'https://api.example/data', resourceType: 'fetch', status: 500 },
      appUrl,
    ),
    false,
  );
});
