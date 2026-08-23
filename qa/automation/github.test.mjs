import assert from 'node:assert/strict';
import test from 'node:test';

import { GitHubClient } from './github.mjs';

async function getGate(pullRequest) {
  const calls = [];
  const commandRunner = async (...args) => {
    calls.push(args);
    return { stdout: JSON.stringify(pullRequest) };
  };
  const gate = await new GitHubClient('owner/repository', commandRunner).getCompletionGate(46);
  return { calls, gate };
}

test('completion gate accepts successful check-run and commit-status payloads', async () => {
  const pullRequest = {
    number: 46,
    state: 'MERGED',
    mergedAt: '2026-08-23T00:00:00Z',
    headRefOid: 'abc123',
    statusCheckRollup: [
      { __typename: 'CheckRun', name: 'verify', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { __typename: 'StatusContext', context: 'claude-review', state: 'SUCCESS' },
    ],
  };

  const { calls, gate } = await getGate(pullRequest);

  assert.deepEqual(calls, [[
    'gh',
    ['pr', 'view', '46', '--repo', 'owner/repository', '--json',
      'number,state,mergedAt,headRefOid,statusCheckRollup'],
  ]]);
  assert.deepEqual(gate.pullRequest, pullRequest);
  assert.deepEqual(
    { merged: gate.merged, verifySuccess: gate.verifySuccess, claudeSuccess: gate.claudeSuccess, complete: gate.complete },
    { merged: true, verifySuccess: true, claudeSuccess: true, complete: true },
  );
});

test('completion gate fails closed for missing checks and stale check names', async () => {
  const missing = await getGate({ number: 46, state: 'MERGED' });
  assert.deepEqual(
    {
      verifySuccess: missing.gate.verifySuccess,
      claudeSuccess: missing.gate.claudeSuccess,
      complete: missing.gate.complete,
    },
    { verifySuccess: false, claudeSuccess: false, complete: false },
  );

  const stale = await getGate({
    number: 46,
    state: 'MERGED',
    mergedAt: '2026-08-23T00:00:00Z',
    statusCheckRollup: [
      { name: 'verify-old', conclusion: 'SUCCESS' },
      { context: 'claude-review-old', state: 'SUCCESS' },
    ],
  });

  assert.deepEqual(
    {
      verifySuccess: stale.gate.verifySuccess,
      claudeSuccess: stale.gate.claudeSuccess,
      complete: stale.gate.complete,
    },
    { verifySuccess: false, claudeSuccess: false, complete: false },
  );
});

test('completion gate fails closed for failed and pending checks', async () => {
  const failed = await getGate({
    number: 46,
    state: 'MERGED',
    statusCheckRollup: [
      { name: 'verify', status: 'COMPLETED', conclusion: 'FAILURE' },
      { context: 'claude-review', state: 'SUCCESS' },
    ],
  });
  assert.deepEqual(
    { verifySuccess: failed.gate.verifySuccess, claudeSuccess: failed.gate.claudeSuccess, complete: failed.gate.complete },
    { verifySuccess: false, claudeSuccess: true, complete: false },
  );

  const pending = await getGate({
    number: 46,
    state: 'MERGED',
    statusCheckRollup: [
      { name: 'verify', status: 'IN_PROGRESS', conclusion: null },
      { context: 'claude-review', state: 'PENDING' },
    ],
  });
  assert.deepEqual(
    { verifySuccess: pending.gate.verifySuccess, claudeSuccess: pending.gate.claudeSuccess, complete: pending.gate.complete },
    { verifySuccess: false, claudeSuccess: false, complete: false },
  );
});

test('completion gate requires the pull request to be merged', async () => {
  const { gate } = await getGate({
    number: 46,
    state: 'OPEN',
    mergedAt: null,
    statusCheckRollup: [
      { name: 'verify', conclusion: 'SUCCESS' },
      { context: 'claude-review', state: 'SUCCESS' },
    ],
  });

  assert.deepEqual(
    { merged: gate.merged, verifySuccess: gate.verifySuccess, claudeSuccess: gate.claudeSuccess, complete: gate.complete },
    { merged: false, verifySuccess: true, claudeSuccess: true, complete: false },
  );
});
