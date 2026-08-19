import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(resolve(repositoryRoot, path), 'utf8');

test('login selects durable or session-only Firebase persistence before authentication', () => {
  const repository = read('src/services/household-repository.ts');
  const persistenceCall = repository.indexOf('await setPersistence(');
  const signInCall = repository.indexOf('return signInWithEmailAndPassword(');

  assert.match(repository, /autoLogin \? browserLocalPersistence : browserSessionPersistence/);
  assert.match(repository, /if \(Platform\.OS === 'web'\)/);
  assert.ok(persistenceCall >= 0, 'Firebase persistence must be configured');
  assert.ok(signInCall > persistenceCall, 'persistence must be selected before submitting credentials');
});

test('login exposes an accessible auto-login choice and password-manager hints', () => {
  const authScreen = read('src/components/auth-screen.tsx');
  const formField = read('src/components/app/form-field.tsx');

  assert.match(authScreen, /useState\(true\)/);
  assert.match(authScreen, /testID="auth-auto-login-toggle"/);
  assert.match(authScreen, /accessibilityRole="checkbox"/);
  assert.match(authScreen, /signInWithEmail\(trimmedEmail, password, autoLogin\)/);
  assert.match(authScreen, /autoComplete="username"/);
  assert.match(authScreen, /'current-password' : 'new-password'/);
  assert.match(authScreen, /'password' : 'newPassword'/);
  assert.match(formField, /autoComplete=\{autoComplete\}/);
  assert.match(formField, /textContentType=\{textContentType\}/);
  assert.doesNotMatch(authScreen, /localStorage|AsyncStorage|SecureStore/);
});
