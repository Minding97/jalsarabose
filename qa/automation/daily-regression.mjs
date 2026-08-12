import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadQaConfig } from '../server/config.mjs';
import { getAutomationBugLabel, JiraClient } from '../server/jira-client.mjs';
import { redactSecrets } from '../server/sanitize.mjs';
import { withExpoWebServer } from './app-server.mjs';
import { runCommand } from './command.mjs';
import { notifyAutomationSummary } from './notification.mjs';

const automationDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(automationDirectory, '../..');
const worktree = resolve(tmpdir(), 'jalsarabose-daily-regression-main');
const lockPath = resolve(tmpdir(), 'jalsarabose-daily-regression.lock');
const nightlyLockPath = resolve(tmpdir(), 'jalsarabose-qa-nightly.lock');
const stateDirectory = resolve(homedir(), '.local/state/jalsarabose');
const statePath = resolve(stateDirectory, 'qa-daily-state.json');
const failureOutputLimit = 4000;
const requiredFirebaseKeys = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];
const safeRuntimeKeys = [
  'LANG',
  'LC_ALL',
  'NODE_EXTRA_CA_CERTS',
  'NO_PROXY',
  'PATH',
  'SSL_CERT_DIR',
  'SSL_CERT_FILE',
  'TMPDIR',
];

function parseFlags(argv) {
  return new Set(argv.filter((value) => value.startsWith('--')));
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export async function waitForNightlyCompletion({
  path = nightlyLockPath,
  timeoutMs = 2 * 60 * 60 * 1000,
  pollIntervalMs = 30_000,
  isRunning = processIsRunning,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let invalidPidReads = 0;
  while (existsSync(path)) {
    let pid;
    try {
      pid = Number(readFileSync(path, 'utf8').trim());
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return;
      }
      throw error;
    }
    if (!Number.isInteger(pid) || pid <= 0) {
      invalidPidReads += 1;
      if (invalidPidReads >= 3) {
        rmSync(path, { force: true });
        return;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, pollIntervalMs));
      continue;
    }
    invalidPidReads = 0;
    if (!isRunning(pid)) {
      rmSync(path, { force: true });
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error('Nightly QA is still active two hours after the daily regression start.');
    }
    console.log(`Waiting for nightly QA process ${pid} to finish before testing merged main.`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, pollIntervalMs));
  }
}

export function discoverBrowserSmokeScripts(packageJson) {
  return Object.keys(packageJson.scripts ?? {})
    .filter((name) => /^qa:[a-z0-9:-]+-smoke$/i.test(name))
    .sort();
}

function sanitizeOutput(value, credentials = []) {
  let safe = redactSecrets(value);
  for (const credential of credentials.filter(Boolean)) {
    safe = safe.replaceAll(credential, '[QA_CREDENTIAL]');
  }
  return safe;
}

export function buildIsolatedEnvironment(
  config,
  extra = {},
  source = process.env,
  homeRoot = worktree,
) {
  const environment = Object.fromEntries(
    safeRuntimeKeys
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
  for (const [key, value] of Object.entries(source)) {
    if (key.startsWith('EXPO_PUBLIC_') && value !== undefined) {
      environment[key] = value;
    }
  }
  const isolated = {
    ...environment,
    HOME: resolve(homeRoot, '.qa-home'),
    XDG_CONFIG_HOME: resolve(homeRoot, '.qa-home/config'),
    NPM_CONFIG_USERCONFIG: '/dev/null',
    QA_CONFIG_PATH: '/dev/null',
    ...extra,
  };
  if (config.testEmail) {
    isolated.QA_TEST_EMAIL = config.testEmail;
  }
  if (config.testPassword) {
    isolated.QA_TEST_PASSWORD = config.testPassword;
  }
  if (config.chromeExecutablePath) {
    isolated.QA_CHROME_EXECUTABLE_PATH = config.chromeExecutablePath;
  }
  return isolated;
}

function scrubDynamicValues(value) {
  return value
    .replace(/\b[0-9a-f]{40}\b/gi, '<sha>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g, '<timestamp>')
    .replace(/\b\d+(?:\.\d+)?ms\b/gi, '<duration>')
    .replace(/\/(?:private\/)?(?:var|tmp)\/[^\s:)]+/g, '<temp-path>')
    .replace(/(https?:\/\/(?:127\.0\.0\.1|localhost)):\d+\b/gi, '$1:<port>')
    .replace(/\b(port|pid|process)\s*[:=]?\s*\d+\b/gi, '$1 <number>')
    .replace(/\b((?:document|household|expense|chore|item|firestore)\s+(?:id\s*)?[:=]?)\s*[a-z0-9_-]{12,}\b/gi, '$1 <id>')
    .replace(/:\d+:\d+/g, ':<line>');
}

function normalizeFailure(value) {
  return scrubDynamicValues(value)
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .sort()
    .join(' ')
    .slice(0, failureOutputLimit);
}

export function createFailureFingerprint(name, output) {
  return createHash('sha256')
    .update(`${name}\n${normalizeFailure(output)}`)
    .digest('hex');
}

export function copyEnvironmentFile(source, destination) {
  copyFileSync(source, destination);
  chmodSync(destination, 0o600);
}

async function prepareLatestMainWorktree() {
  await runCommand('git', ['fetch', 'origin', 'main'], { cwd: repositoryRoot });
  await runCommand('git', ['worktree', 'remove', '--force', worktree], {
    cwd: repositoryRoot,
    allowFailure: true,
  });
  rmSync(worktree, { recursive: true, force: true });
  await runCommand('git', ['worktree', 'prune'], { cwd: repositoryRoot });
  await runCommand('git', ['worktree', 'add', '--detach', worktree, 'origin/main'], {
    cwd: repositoryRoot,
  });

  const sourceEnv = resolve(repositoryRoot, '.env.local');
  if (existsSync(sourceEnv)) {
    copyEnvironmentFile(sourceEnv, resolve(worktree, '.env.local'));
  } else if (requiredFirebaseKeys.some((key) => !process.env[key])) {
    throw new Error(`Daily regression requires ${sourceEnv} or Firebase environment variables.`);
  }
  mkdirSync(resolve(worktree, '.qa-home/config'), { recursive: true, mode: 0o700 });
  await runCommand('npm', ['ci', '--ignore-scripts'], {
    cwd: worktree,
    timeoutMs: 15 * 60 * 1000,
    inheritEnv: false,
    env: buildIsolatedEnvironment({}, { CI: '1' }),
  });
  const head = await runCommand('git', ['rev-parse', 'HEAD'], { cwd: worktree });
  return head.stdout.trim();
}

async function runSuite({ name, command, args, cwd, env, timeoutMs }) {
  const result = await runCommand(command, args, {
    cwd,
    env,
    inheritEnv: false,
    timeoutMs,
    allowFailure: true,
    maxCaptureBytes: 4 * 1024 * 1024,
  });
  return {
    name,
    command: [command, ...args].join(' '),
    passed: result.exitCode === 0 && !result.timedOut,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function runRegressionSuites(config) {
  const testEnvironment = buildIsolatedEnvironment(config, {
    SMOKE_TEST_EMAIL: config.testEmail,
    SMOKE_TEST_PASSWORD: config.testPassword,
  });
  const results = [];
  const verification = await runSuite({
    name: 'project-verify',
    command: 'npm',
    args: ['run', 'verify'],
    cwd: worktree,
    env: testEnvironment,
    timeoutMs: 30 * 60 * 1000,
  });
  results.push(verification);
  if (!verification.passed) {
    console.error('Project verification failed; browser smoke tests were skipped.');
    return results;
  }

  const packageJson = JSON.parse(readFileSync(resolve(worktree, 'package.json'), 'utf8'));
  const smokeScripts = discoverBrowserSmokeScripts(packageJson);
  if (smokeScripts.length === 0) {
    console.log('No browser smoke scripts are registered yet.');
    return results;
  }

  try {
    await withExpoWebServer(
      {
        worktree,
        port: config.replayPort,
        env: testEnvironment,
        inheritEnv: false,
      },
      async (appUrl) => {
        for (const script of smokeScripts) {
          const result = await runSuite({
            name: script,
            command: 'npm',
            args: ['run', script],
            cwd: worktree,
            env: { ...testEnvironment, QA_APP_URL: appUrl },
            timeoutMs: 15 * 60 * 1000,
          });
          results.push(result);
          console.log(`${result.passed ? 'PASS' : 'FAIL'} ${script}`);
        }
      },
    );
  } catch (error) {
    results.push({
      name: 'browser-smoke-server',
      command: 'expo start --web',
      passed: false,
      exitCode: 1,
      timedOut: false,
      stdout: '',
      stderr: error instanceof Error ? error.stack ?? error.message : String(error),
    });
  }
  return results;
}

export function buildFailureMetadata({ failure, commitSha, config, now = new Date() }) {
  const output = scrubDynamicValues(
    sanitizeOutput(
      failure.stderr || failure.stdout || `${failure.command} exited with ${failure.exitCode}.`,
      [config.testEmail, config.testPassword, config.jiraApiToken, config.recordingKey],
    ),
  );
  const fingerprint = createFailureFingerprint(failure.name, output);
  return {
    fingerprint,
    reportId: `daily-${fingerprint.slice(0, 16)}-${commitSha.slice(0, 8)}`,
    kind: 'bug',
    memo: `[일일 자동 QA] ${failure.name} 실패`,
    reporter: '일일 자동 QA',
    path: `automation:${failure.name}`,
    createdAt: now.toISOString(),
    userAgent: 'jalsarabose-daily-regression',
    viewport: { width: 0, height: 0, devicePixelRatio: 1 },
    commitSha,
    recordingIncluded: false,
    recordingStepCount: 0,
    recordingDurationMs: 0,
    details: output.slice(-failureOutputLimit),
    labels: ['daily-regression', getAutomationBugLabel(fingerprint)],
  };
}

export async function reportFailures({ jira, failures, commitSha, config, dryRun }) {
  const reports = [];
  for (const failure of failures) {
    const metadata = buildFailureMetadata({ failure, commitSha, config });
    const existing = await jira.findOpenAutomationBug(metadata.fingerprint);
    if (existing) {
      reports.push({ suite: failure.name, action: 'existing', issueKey: existing.key });
      console.log(`${failure.name}: existing open bug ${existing.key}`);
      continue;
    }

    const duplicate = await jira.findReport(metadata.reportId);
    if (duplicate) {
      reports.push({ suite: failure.name, action: 'duplicate', issueKey: duplicate.key });
      continue;
    }

    if (dryRun) {
      reports.push({ suite: failure.name, action: 'dry-run', issueKey: null });
      console.log(`${failure.name}: dry-run would create ${metadata.reportId}`);
      continue;
    }

    const issue = await jira.createReport(metadata);
    const attachment = Buffer.from(
      `${JSON.stringify(
        {
          suite: failure.name,
          command: failure.command,
          commitSha,
          exitCode: failure.exitCode,
          timedOut: failure.timedOut,
          output: metadata.details,
        },
        null,
        2,
      )}\n`,
    );
    try {
      await jira.attach(issue.key, 'daily-qa-failure.json', attachment, 'application/json');
    } catch (error) {
      console.error(
        `${issue.key}: failure attachment was not uploaded: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    reports.push({ suite: failure.name, action: 'created', issueKey: issue.key });
    console.log(`${failure.name}: created ${issue.key}`);
  }
  return reports;
}

function readState() {
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
}

export function shouldSkipDailyRegression(previous, today, force) {
  return !force && previous?.date === today;
}

export async function withExclusiveLock(path, operation) {
  let descriptor;
  try {
    descriptor = openSync(path, 'wx', 0o600);
    writeFileSync(descriptor, String(process.pid));
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error('Daily regression is already running.');
    }
    throw error;
  }

  try {
    return await operation();
  } finally {
    closeSync(descriptor);
    rmSync(path, { force: true });
  }
}

async function cleanupLatestMainWorktree() {
  await runCommand('git', ['worktree', 'remove', '--force', worktree], {
    cwd: repositoryRoot,
    allowFailure: true,
  });
  rmSync(worktree, { recursive: true, force: true });
}

export async function withGuaranteedCleanup(operation, cleanup) {
  try {
    return await operation();
  } finally {
    await cleanup();
  }
}

export async function runDailyRegression({ force = false, dryRun = false } = {}) {
  const config = loadQaConfig();
  if (!config.testEmail || !config.testPassword) {
    throw new Error('QA_TEST_EMAIL and QA_TEST_PASSWORD are required for daily regression.');
  }
  if (!dryRun && !config.jiraConfigured) {
    throw new Error('Jira must be configured before daily regression can create bug tickets.');
  }

  mkdirSync(stateDirectory, { recursive: true });
  const today = localDateKey();
  const previous = readState();
  if (shouldSkipDailyRegression(previous, today, force)) {
    console.log(`Daily regression already ran on ${today}; skipping.`);
    return previous;
  }

  return withExclusiveLock(lockPath, () =>
    withGuaranteedCleanup(async () => {
      await waitForNightlyCompletion();
      const commitSha = await prepareLatestMainWorktree();
      console.log(`Testing origin/main at ${commitSha}.`);
      const results = await runRegressionSuites(config);
      const failures = results.filter((result) => !result.passed);
      const jira = new JiraClient(config);
      const reports = await reportFailures({ jira, failures, commitSha, config, dryRun });
      const summary = {
        date: today,
        completedAt: new Date().toISOString(),
        commitSha,
        passed: failures.length === 0,
        suites: results.map((result) => ({ name: result.name, passed: result.passed })),
        reports,
      };
      if (!dryRun) {
        writeFileSync(statePath, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
      }
      console.log(JSON.stringify(summary, null, 2));
      if (failures.length > 0) {
        process.exitCode = 1;
      }
      return summary;
    }, cleanupLatestMainWorktree),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flags = parseFlags(process.argv.slice(2));
  const dryRun = flags.has('--dry-run');
  const startedAt = new Date().toISOString();
  const runId = `daily-${startedAt}-${process.pid}`;
  const config = loadQaConfig();
  let summary;
  try {
    const result = await runDailyRegression({ force: flags.has('--force'), dryRun });
    summary = {
      kind: 'daily', runId, startedAt, completedAt: new Date().toISOString(),
      status: result?.passed === false ? '실패' : '성공',
      commitSha: result?.commitSha, suites: result?.suites ?? [], reports: result?.reports ?? [],
      verification: result?.suites?.length ? `${result.suites.filter((suite) => suite.passed).length}/${result.suites.length} 통과` : '오늘 실행은 이미 완료되어 중복 테스트를 건너뜀',
      failures: result?.suites?.filter((suite) => !suite.passed).map((suite) => suite.name) ?? [],
      remainingQueue: [], nextAction: result?.passed === false ? '생성/연결된 Jira 버그 확인' : '다음 일일 회귀 테스트',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    summary = { kind: 'daily', runId, startedAt, completedAt: new Date().toISOString(), status: '실패', suites: [], reports: [], verification: '실행 중단', failures: [message], remainingQueue: [], nextAction: '로그와 환경 설정 확인 후 재실행' };
    process.exitCode = 1;
  }
  try {
    await notifyAutomationSummary({ summary, config, dryRun });
  } catch (error) {
    console.error(`Daily Telegram notification failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
