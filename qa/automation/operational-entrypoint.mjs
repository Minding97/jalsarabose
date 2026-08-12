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

export function runOperationalTarget(target, args = [], { root = repositoryRoot, run = runChecked } = {}) {
  if (!allowedTargets.has(target)) {
    throw new Error(`Unsupported operational target: ${target}`);
  }
  const activated = activateOperationalCheckout({ root, run });
  console.log(`Operational checkout activated at ${activated}.`);
  run(process.execPath, [resolve(root, 'qa/automation', target), ...args], {
    cwd: root,
    stdio: 'inherit',
    encoding: undefined,
  });
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
  let descriptor;
  try {
    descriptor = acquireActivationLock();
    const [target, ...args] = process.argv.slice(2);
    if (!allowedTargets.has(target)) {
      throw new Error(`Unsupported operational target: ${target}`);
    }
    const activated = activateOperationalCheckout();
    closeSync(descriptor);
    descriptor = undefined;
    unlinkSync(activationLockPath);
    console.log(`Operational checkout activated at ${activated}.`);
    runChecked(process.execPath, [resolve(repositoryRoot, 'qa/automation', target), ...args], {
      cwd: repositoryRoot,
      stdio: 'inherit',
      encoding: undefined,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (descriptor !== undefined) unlinkSync(activationLockPath);
  }
}
