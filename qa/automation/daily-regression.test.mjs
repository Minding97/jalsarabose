import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  buildFailureMetadata,
  buildIsolatedEnvironment,
  copyEnvironmentFile,
  createFailureFingerprint,
  discoverBrowserSmokeScripts,
  reportFailures,
  shouldSkipDailyRegression,
  withExclusiveLock,
  withGuaranteedCleanup,
  waitForNightlyCompletion,
} from './daily-regression.mjs';
import { buildLaunchAgentPlist, resolveNodeExecutable } from './install-schedule.mjs';
import { shouldStopForDeadline } from './nightly-plan.mjs';

const config = {
  testEmail: 'qa@example.com',
  testPassword: 'test-password',
  jiraApiToken: 'jira-secret',
  recordingKey: 'recording-secret',
};

function failure(overrides = {}) {
  return {
    name: 'qa:expense-smoke',
    command: 'npm run qa:expense-smoke',
    passed: false,
    exitCode: 1,
    timedOut: false,
    stdout: '',
    stderr: 'Error: button failed at /private/tmp/run/app.ts:42:10',
    ...overrides,
  };
}

test('discovers only registered browser smoke scripts in stable order', () => {
  const scripts = discoverBrowserSmokeScripts({
    scripts: {
      'qa:review': 'node review.mjs',
      'qa:fridge-smoke': 'node fridge.mjs',
      'qa:expense-smoke': 'node expense.mjs',
      'smoke:firebase': 'node firebase.mjs',
    },
  });

  assert.deepEqual(scripts, ['qa:expense-smoke', 'qa:fridge-smoke']);
});

test('normalizes dynamic paths, IDs, ports, PIDs, ordering, and timestamps in fingerprints', () => {
  const first = createFailureFingerprint(
    'project-verify',
    [
      'server http://127.0.0.1:8091 pid 1234',
      'household id: Abcdef1234567890Wxyz',
      'request 123e4567-e89b-12d3-a456-426614174000',
      'Error at /private/tmp/one/app.ts:42:10 2026-08-04T01:02:03.000Z abcdefabcdefabcdefabcdefabcdefabcdefabcd',
    ].join('\n'),
  );
  const second = createFailureFingerprint(
    'project-verify',
    [
      'Error at /tmp/two/app.ts:99:2 2026-08-05T04:05:06.000Z 1234512345123451234512345123451234512345',
      'request 987e6543-e21b-12d3-a456-426614174999',
      'household id: Zyxwvu9876543210Dcba',
      'server http://127.0.0.1:8999 pid 9876',
    ].join('\n'),
  );

  assert.equal(first, second);
});

test('redacts QA credentials and adds a stable automation label', () => {
  const metadata = buildFailureMetadata({
    failure: failure({
      stderr:
        'authorization=secret-token qa@example.com test-password jira-secret recording-secret household id: Abcdef1234567890Wxyz /private/tmp/private/app.ts:42:10',
    }),
    commitSha: 'a'.repeat(40),
    config,
    now: new Date('2026-08-04T07:10:00.000Z'),
  });

  assert.equal(metadata.kind, 'bug');
  assert.match(metadata.reportId, /^daily-[a-f0-9]{16}-aaaaaaaa$/);
  assert.ok(metadata.labels.includes('daily-regression'));
  assert.ok(metadata.labels.some((label) => label.startsWith('daily-qa-')));
  assert.doesNotMatch(
    metadata.details,
    /secret-token|qa@example\.com|test-password|jira-secret|recording-secret|Abcdef1234567890Wxyz|private\/app\.ts/,
  );
});

test('isolates subprocesses from host secrets while preserving public app settings', () => {
  const environment = buildIsolatedEnvironment(
    config,
    { CI: '1' },
    {
      PATH: '/usr/bin:/bin',
      JIRA_API_TOKEN: 'host-jira-secret',
      QA_RECORDING_KEY: 'host-recording-secret',
      UNRELATED_SECRET: 'host-secret',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'public-project',
    },
    '/tmp/isolated-root',
  );

  assert.equal(environment.PATH, '/usr/bin:/bin');
  assert.equal(environment.EXPO_PUBLIC_FIREBASE_PROJECT_ID, 'public-project');
  assert.equal(environment.QA_TEST_EMAIL, config.testEmail);
  assert.equal(environment.HOME, '/tmp/isolated-root/.qa-home');
  assert.equal(environment.CI, '1');
  assert.equal(environment.JIRA_API_TOKEN, undefined);
  assert.equal(environment.QA_RECORDING_KEY, undefined);
  assert.equal(environment.UNRELATED_SECRET, undefined);
});

test('reuses an open Jira bug instead of creating a duplicate', async () => {
  let createCalls = 0;
  const jira = {
    findOpenAutomationBug: async () => ({ key: 'JAL-50' }),
    findReport: async () => null,
    createReport: async () => {
      createCalls += 1;
      return { key: 'JAL-51' };
    },
  };

  const reports = await reportFailures({
    jira,
    failures: [failure()],
    commitSha: 'b'.repeat(40),
    config,
    dryRun: false,
  });

  assert.equal(createCalls, 0);
  assert.deepEqual(reports, [
    { suite: 'qa:expense-smoke', action: 'existing', issueKey: 'JAL-50' },
  ]);
});

test('creates and attaches a new Jira bug when no duplicate exists', async () => {
  const calls = [];
  const jira = {
    findOpenAutomationBug: async () => null,
    findReport: async () => null,
    createReport: async (metadata) => {
      calls.push(['create', metadata]);
      return { key: 'JAL-52' };
    },
    attach: async (issueKey, filename, data, contentType) => {
      calls.push(['attach', issueKey, filename, data, contentType]);
    },
  };

  const reports = await reportFailures({
    jira,
    failures: [failure()],
    commitSha: 'c'.repeat(40),
    config,
    dryRun: false,
  });

  assert.equal(calls[0][0], 'create');
  assert.equal(calls[0][1].kind, 'bug');
  assert.deepEqual(calls[1].slice(0, 3), ['attach', 'JAL-52', 'daily-qa-failure.json']);
  assert.equal(calls[1][4], 'application/json');
  assert.deepEqual(reports, [
    { suite: 'qa:expense-smoke', action: 'created', issueKey: 'JAL-52' },
  ]);
});

test('builds a daily launch agent at the configured time', () => {
  const plist = buildLaunchAgentPlist({
    label: 'com.jalsarabose.qa-daily',
    scriptPath: '/tmp/daily-regression.mjs',
    workingDirectory: '/tmp/project',
    hour: 7,
    minute: 10,
    stdoutPath: '/tmp/out.log',
    stderrPath: '/tmp/error.log',
  });

  assert.match(plist, /com\.jalsarabose\.qa-daily/);
  assert.match(plist, /<integer>7<\/integer>/);
  assert.match(plist, /<integer>10<\/integer>/);
  assert.match(plist, /daily-regression\.mjs/);
  assert.match(plist, new RegExp(resolveNodeExecutable().replaceAll('/', '\\/')));
});

test('lets once and forced runs process one item after the nightly deadline', () => {
  const deadline = new Date('2026-08-12T07:00:00+09:00');
  const now = new Date('2026-08-12T08:00:00+09:00').getTime();

  assert.equal(shouldStopForDeadline({ now, deadline, force: false, once: true }), false);
  assert.equal(shouldStopForDeadline({ now, deadline, force: true, once: false }), false);
  assert.equal(shouldStopForDeadline({ now, deadline, force: false, once: false }), true);
});

test('skips a completed same-day run unless force is enabled', () => {
  const previous = { date: '2026-08-04', passed: true };

  assert.equal(shouldSkipDailyRegression(previous, '2026-08-04', false), true);
  assert.equal(shouldSkipDailyRegression(previous, '2026-08-04', true), false);
  assert.equal(shouldSkipDailyRegression(previous, '2026-08-05', false), false);
});

test('rejects a concurrent run and removes its lock after failure', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'jalsarabose-daily-lock-'));
  const path = resolve(directory, 'daily.lock');

  try {
    writeFileSync(path, '123');
    await assert.rejects(
      withExclusiveLock(path, async () => undefined),
      /already running/,
    );
    rmSync(path);

    await assert.rejects(
      withExclusiveLock(path, async () => {
        throw new Error('suite failed');
      }),
      /suite failed/,
    );
    assert.equal(existsSync(path), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('runs worktree cleanup when a regression suite throws', async () => {
  let cleaned = false;

  await assert.rejects(
    withGuaranteedCleanup(
      async () => {
        throw new Error('regression failed');
      },
      async () => {
        cleaned = true;
      },
    ),
    /regression failed/,
  );
  assert.equal(cleaned, true);
});

test('waits for a live nightly PID and removes a stale nightly lock', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'jalsarabose-nightly-lock-'));
  const path = resolve(directory, 'nightly.lock');

  try {
    writeFileSync(path, String(process.pid));
    setTimeout(() => rmSync(path, { force: true }), 10);
    await waitForNightlyCompletion({
      path,
      timeoutMs: 200,
      pollIntervalMs: 5,
      isRunning: (pid) => pid === process.pid,
    });
    assert.equal(existsSync(path), false);

    writeFileSync(path, '');
    setTimeout(() => {
      writeFileSync(path, String(process.pid));
      setTimeout(() => rmSync(path, { force: true }), 10);
    }, 5);
    await waitForNightlyCompletion({
      path,
      timeoutMs: 200,
      pollIntervalMs: 5,
      isRunning: (pid) => pid === process.pid,
    });
    assert.equal(existsSync(path), false);

    writeFileSync(path, '999999');
    await waitForNightlyCompletion({
      path,
      timeoutMs: 100,
      pollIntervalMs: 1,
      isRunning: () => false,
    });
    assert.equal(existsSync(path), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('restricts copied environment files to the current user', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'jalsarabose-env-copy-'));
  const source = resolve(directory, 'source.env');
  const destination = resolve(directory, 'destination.env');

  try {
    writeFileSync(source, 'EXAMPLE=value\n', { mode: 0o644 });
    copyEnvironmentFile(source, destination);

    assert.equal(statSync(destination).mode & 0o777, 0o600);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
