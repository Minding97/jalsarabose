import assert from 'node:assert/strict';
import { closeSync, mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { acquireActivationLock, activateOperationalCheckout, runOperationalTarget } from './operational-entrypoint.mjs';

test('activates the exact fetched origin/main commit before starting the target', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'jalsarabose-activation-'));
  writeFileSync(resolve(root, 'package-lock.json'), 'same');
  const calls = [];
  const run = (command, args) => {
    calls.push([command, args]);
    if (command === 'gh' && args[0] === 'repo') return 'Minding97/jalsarabose';
    if (command === 'gh' && args.at(-1)?.endsWith('/pulls')) return JSON.stringify([{ merged_at: 'now', base: { ref: 'main' }, head: { sha: 'feature123' } }]);
    if (command === 'gh' && args.at(-1)?.endsWith('/status')) return JSON.stringify({ statuses: [{ context: 'independent-review-gate', state: 'success' }] });
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-parse' && args[1] === '--verify') return 'abc123';
    if (args[0] === 'rev-parse') return 'abc123';
    return '';
  };

  runOperationalTarget('nightly-runner.mjs', ['--dry-run'], { root, run });
  assert.deepEqual(calls.filter((call) => call[0] === 'git').slice(0, 5).map((call) => call[1]), [
    ['status', '--porcelain'],
    ['fetch', '--quiet', 'origin', 'main'],
    ['rev-parse', '--verify', 'origin/main^{commit}'],
    ['checkout', '--quiet', '--detach', 'abc123'],
    ['rev-parse', 'HEAD'],
  ]);
  assert.deepEqual(calls.at(-1)[1], [resolve(root, 'qa/automation/nightly-runner.mjs'), '--dry-run']);
});

test('refuses activation when the operational checkout contains local changes', () => {
  assert.throws(
    () => activateOperationalCheckout({ run: () => ' M protected-file' }),
    /refusing to overwrite/,
  );
});

test('rejects arbitrary executable targets', () => {
  assert.throws(() => runOperationalTarget('../../other.mjs'), /Unsupported operational target/);
});

test('holds the activation lock until the operational target exits', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'jalsarabose-activation-lock-'));
  const lockPath = resolve(root, 'activation.lock');
  writeFileSync(resolve(root, 'package-lock.json'), 'same');
  const run = (_command, args) => {
    if (args[0] === 'repo') return 'Minding97/jalsarabose';
    if (args.at(-1)?.endsWith('/pulls')) return JSON.stringify([{ merged_at: 'now', base: { ref: 'main' }, head: { sha: 'feature123' } }]);
    if (args.at(-1)?.endsWith('/status')) return JSON.stringify({ statuses: [{ context: 'independent-review-gate', state: 'success' }] });
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-parse' && args[1] === '--verify') return 'abc123';
    if (args[0] === 'rev-parse') return 'abc123';
    if (args[0]?.endsWith('nightly-runner.mjs')) {
      assert.throws(() => acquireActivationLock(lockPath), /Another operational activation is active/);
    }
    return '';
  };
  runOperationalTarget('nightly-runner.mjs', [], { root, run, lockPath });
  const descriptor = acquireActivationLock(lockPath);
  closeSync(descriptor);
  unlinkSync(lockPath);
});

test('refuses to activate a main commit without a successful independent review gate', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'jalsarabose-activation-ungated-'));
  writeFileSync(resolve(root, 'package-lock.json'), 'same');
  const run = (_command, args) => {
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-parse') return 'ungated123';
    if (args[0] === 'repo') return 'Minding97/jalsarabose';
    if (args.at(-1)?.endsWith('/pulls')) return JSON.stringify([{ merged_at: 'now', base: { ref: 'main' }, head: { sha: 'feature123' } }]);
    if (args.at(-1)?.endsWith('/status')) return JSON.stringify({ statuses: [] });
    return '';
  };
  assert.throws(() => activateOperationalCheckout({ root, run }), /lacks a passing independent-review-gate/);
});
