import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const activationLockPath = resolve(tmpdir(), 'jalsarabose-automation-activation.lock');
const allowedTargets = new Set(['nightly-runner.mjs', 'daily-regression.mjs']);

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} ${args.join(' ')} failed.`);
  }
  return result.stdout?.trim() ?? '';
}

export function verifyOperationalCommitGate(target, run = runChecked) {
  const repository = run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
  const pullRequests = JSON.parse(run('gh', [
    'api', `repos/${repository}/commits/${target}/pulls`,
  ]) || '[]');
  const mergedPullRequest = pullRequests.find((pullRequest) =>
    pullRequest.merged_at && pullRequest.base?.ref === 'main' && pullRequest.head?.sha);
  if (!mergedPullRequest) {
    throw new Error(`Operational activation refused: ${target} is not associated with a merged main pull request.`);
  }
  const combined = JSON.parse(run('gh', [
    'api', `repos/${repository}/commits/${mergedPullRequest.head.sha}/status`,
  ]) || '{}');
  const passed = combined.statuses?.some((status) =>
    status.context === 'independent-review-gate' && status.state === 'success');
  if (!passed) {
    throw new Error(`Operational activation refused: ${target} lacks a passing independent-review-gate.`);
  }
}

export function activateOperationalCheckout({ root = repositoryRoot, run = runChecked } = {}) {
  const status = run('git', ['status', '--porcelain'], { cwd: root });
  if (status) {
    throw new Error('Operational checkout has local changes; refusing to overwrite them.');
  }

  const previousLock = existsSync(resolve(root, 'package-lock.json'))
    ? readFileSync(resolve(root, 'package-lock.json'), 'utf8')
    : null;
  run('git', ['fetch', '--quiet', 'origin', 'main'], { cwd: root });
  const target = run('git', ['rev-parse', '--verify', 'origin/main^{commit}'], { cwd: root });
  verifyOperationalCommitGate(target, run);
  run('git', ['checkout', '--quiet', '--detach', target], { cwd: root });
  const activated = run('git', ['rev-parse', 'HEAD'], { cwd: root });
  if (activated !== target) {
    throw new Error(`Operational activation mismatch: expected ${target}, got ${activated}.`);
  }

  const nextLock = existsSync(resolve(root, 'package-lock.json'))
    ? readFileSync(resolve(root, 'package-lock.json'), 'utf8')
    : null;
  if (previousLock !== nextLock) {
    run('npm', ['ci', '--ignore-scripts'], { cwd: root });
  }
  return activated;
}

export function runOperationalTarget(target, args = [], {
  root = repositoryRoot, run = runChecked, lockPath = activationLockPath,
} = {}) {
  if (!allowedTargets.has(target)) {
    throw new Error(`Unsupported operational target: ${target}`);
  }
  const descriptor = acquireActivationLock(lockPath);
  try {
    const activated = activateOperationalCheckout({ root, run });
    console.log(`Operational checkout activated at ${activated}.`);
    run(process.execPath, [resolve(root, 'qa/automation', target), ...args], {
      cwd: root,
      stdio: 'inherit',
      encoding: undefined,
    });
  } finally {
    closeSync(descriptor);
    unlinkSync(lockPath);
  }
}

export function acquireActivationLock(path = activationLockPath) {
  try {
    const descriptor = openSync(path, 'wx', 0o600);
    writeFileSync(descriptor, String(process.pid));
    return descriptor;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const pid = Number(readFileSync(path, 'utf8').trim());
    try {
      process.kill(pid, 0);
    } catch (processError) {
      if (processError?.code === 'ESRCH' || !Number.isInteger(pid) || pid <= 0) {
        unlinkSync(path);
        return acquireActivationLock(path);
      }
    }
    throw new Error(`Another operational activation is active (${path}).`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [target, ...args] = process.argv.slice(2);
    runOperationalTarget(target, args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
