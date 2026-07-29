import assert from 'node:assert/strict';
import test from 'node:test';

import {
  consumeNonce,
  isAllowedOrigin,
  isPrivateAddress,
  issueNonce,
} from './security.mjs';

test('allows loopback and RFC1918 addresses only', () => {
  assert.equal(isPrivateAddress('127.0.0.1'), true);
  assert.equal(isPrivateAddress('::ffff:192.168.0.8'), true);
  assert.equal(isPrivateAddress('10.0.0.5'), true);
  assert.equal(isPrivateAddress('8.8.8.8'), false);
});

test('allows QA origins on the configured Expo port', () => {
  assert.equal(isAllowedOrigin('http://192.168.0.8:8081', 8081), true);
  assert.equal(isAllowedOrigin('https://192.168.0.8:8081', 8081), false);
  assert.equal(isAllowedOrigin('http://192.168.0.8:3000', 8081), false);
});

test('issues single-use nonces bound to an IP and origin', () => {
  const origin = 'http://192.168.0.8:8081';
  const nonce = issueNonce('192.168.0.9', origin);

  assert.equal(consumeNonce(nonce, '192.168.0.10', origin), false);
  assert.equal(consumeNonce(nonce, '192.168.0.9', origin), true);
  assert.equal(consumeNonce(nonce, '192.168.0.9', origin), false);
});

