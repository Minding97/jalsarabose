import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { activateOperationalCheckout, runOperationalTarget } from './operational-entrypoint.mjs';

test('activates the exact fetched origin/main commit before starting the target', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'jalsarabose-activation-'));
  writeFileSync(resolve(root, 'package-lock.json'), 'same');
  const calls = [];
  const run = (command, args) => {
    calls.push([command, args]);
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-parse' && args[1] === '--verify') return 'abc123';
    if (args[0] === 'rev-parse') return 'abc123';
    return '';
  };

  runOperationalTarget('nightly-runner.mjs', ['--dry-run'], { root, run });
  assert.deepEqual(calls.slice(0, 5).map((call) => call[1]), [
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
