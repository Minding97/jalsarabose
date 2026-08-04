import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const verifyEnvScript = resolve(repositoryRoot, 'scripts/verify-env.mjs');
const firebaseKeys = {
  EXPO_PUBLIC_FIREBASE_API_KEY: 'test-api-key',
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'test-project',
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'test.appspot.com',
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  EXPO_PUBLIC_FIREBASE_APP_ID: 'test-app-id',
};

function runVerification({ useMocks, configuredProject = 'firebase-project' }) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'jalsarabose-verify-env-'));
  const exampleKeys = [
    'EXPO_PUBLIC_USE_MOCKS',
    'EXPO_PUBLIC_BACKEND_PROVIDER',
    ...Object.keys(firebaseKeys),
  ];

  writeFileSync(
    join(fixtureRoot, '.env.example'),
    exampleKeys.map((key) => `${key}=`).join('\n'),
  );
  writeFileSync(
    join(fixtureRoot, '.firebaserc'),
    JSON.stringify({ projects: { default: configuredProject } }),
  );

  try {
    return spawnSync(process.execPath, [verifyEnvScript], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        EXPO_PUBLIC_USE_MOCKS: String(useMocks),
        EXPO_PUBLIC_BACKEND_PROVIDER: 'firebase',
        ...firebaseKeys,
      },
    });
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

test('mock verification allows a synthetic project ID', () => {
  const result = runVerification({ useMocks: true });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Environment verification passed/);
});

test('live verification rejects a project ID that differs from .firebaserc', () => {
  const result = runVerification({ useMocks: false });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not match EXPO_PUBLIC_FIREBASE_PROJECT_ID/);
});

test('live verification accepts the configured Firebase project', () => {
  const result = runVerification({
    useMocks: false,
    configuredProject: firebaseKeys.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  });

  assert.equal(result.status, 0, result.stderr);
});
