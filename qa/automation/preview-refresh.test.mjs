import assert from 'node:assert/strict';
import test from 'node:test';

import { previewEligibility } from './preview-refresh.mjs';

const success = {
  status: '성공',
  ticketResults: [{ key: 'JAL-1', result: '성공' }],
  pullRequests: ['#1 merged'],
  remainingQueue: [],
};

test('refreshes only after every processed ticket and PR completed', () => {
  assert.deepEqual(previewEligibility(success), { eligible: true });
  assert.equal(previewEligibility({ ...success, pullRequests: ['#1 대기'] }).eligible, false);
  assert.equal(previewEligibility({ ...success, ticketResults: [{ key: 'JAL-1', result: '보류' }] }).eligible, false);
  assert.equal(previewEligibility({ ...success, remainingQueue: ['JAL-2'] }).eligible, false);
});

test('never refreshes for dry runs or failed nightly execution', () => {
  assert.equal(previewEligibility(success, { dryRun: true }).eligible, false);
  assert.equal(previewEligibility(success, { runFailed: true }).eligible, false);
});
