import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSafeTrace,
  redactSecrets,
  sanitizeRecordingForStorage,
} from './sanitize.mjs';

test('removes access tokens from safe trace details', () => {
  const source =
    'Authorization: Bearer secret-token-value eyJhbGciOiJSUzI1NiJ9.payload.signature';
  assert.equal(redactSecrets(source).includes('secret-token-value'), false);
  assert.equal(redactSecrets(source).includes('eyJhbGciOiJSUzI1NiJ9'), false);
});

test('keeps only the presence of captured input values', () => {
  const trace = createSafeTrace({
    version: 1,
    startedAt: '2026-07-29T00:00:00.000Z',
    endedAt: '2026-07-29T00:00:01.000Z',
    durationMs: 1000,
    steps: [
      {
        sequence: 1,
        at: '2026-07-29T00:00:00.500Z',
        offsetMs: 500,
        action: 'input',
        path: '/',
        selector: '[data-testid="auth-password-input"]',
        value: 'test-password',
      },
    ],
  });

  assert.equal(trace.steps[0].valueCaptured, true);
  assert.equal('value' in trace.steps[0], false);
});

test('removes infrastructure secrets while preserving QA form values', () => {
  const recording = sanitizeRecordingForStorage({
    authorization: 'Bearer firebase-token',
    nested: {
      apiToken: 'jira-secret',
      detail: 'cookie=session-secret',
      value: 'test-password',
    },
  });

  assert.equal(recording.authorization, '[REDACTED]');
  assert.equal(recording.nested.apiToken, '[REDACTED]');
  assert.equal(recording.nested.detail, '[REDACTED]');
  assert.equal(recording.nested.value, 'test-password');
});
