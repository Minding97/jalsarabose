import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import { decryptRecording, encryptRecording, parseRecordingKey } from './crypto.mjs';

test('encrypts and decrypts a QA recording', () => {
  const key = randomBytes(32).toString('base64');
  const source = Buffer.from('qa-email@example.com:test-password');
  const encrypted = encryptRecording(source, key);

  assert.notDeepEqual(encrypted, source);
  assert.deepEqual(decryptRecording(encrypted, key), source);
});

test('rejects invalid recording keys', () => {
  assert.throws(() => parseRecordingKey('too-short'), /32 bytes/);
});

