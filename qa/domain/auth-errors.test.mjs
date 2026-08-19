import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_SIGN_IN_ATTEMPTS,
  getSignInErrorKind,
  getSignInErrorMessage,
} from '../../src/domain/auth-errors.ts';

test('maps Firebase credential failures to safe Korean login messages', () => {
  assert.equal(getSignInErrorMessage({ code: 'auth/invalid-credential' }), '비밀번호가 틀렸습니다.');
  assert.equal(getSignInErrorMessage({ code: 'auth/wrong-password' }), '비밀번호가 틀렸습니다.');
  assert.equal(getSignInErrorMessage({ code: 'auth/user-not-found' }), '아이디가 틀렸습니다.');
  assert.equal(getSignInErrorMessage({ code: 'auth/invalid-email' }), '아이디가 틀렸습니다.');
});

test('identifies only password failures as attempts subject to the five try limit', () => {
  assert.equal(MAX_SIGN_IN_ATTEMPTS, 5);
  assert.equal(getSignInErrorKind({ code: 'auth/invalid-credential' }), 'wrong-password');
  assert.equal(getSignInErrorKind({ code: 'auth/user-not-found' }), 'wrong-email');
  assert.equal(getSignInErrorKind({ code: 'auth/too-many-requests' }), 'too-many-requests');
});

test('never exposes raw Firebase errors for operational or unknown failures', () => {
  assert.equal(
    getSignInErrorMessage({ code: 'auth/network-request-failed' }),
    '네트워크 연결을 확인한 후 다시 시도해주세요.',
  );
  assert.equal(
    getSignInErrorMessage(new Error('Firebase: Error (auth/internal-error).')),
    '로그인에 실패했습니다. 잠시 후 다시 시도해주세요.',
  );
});
