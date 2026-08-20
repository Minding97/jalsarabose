import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(resolve(repositoryRoot, path), 'utf8');

test('login attempts the selected web persistence without blocking authentication on failure', () => {
  const repository = read('src/services/household-repository.ts');
  const persistenceCall = repository.indexOf('await setPersistence(');
  const persistenceFallback = repository.indexOf('} catch {', persistenceCall);
  const signInCall = repository.indexOf('return signInWithEmailAndPassword(');

  assert.match(repository, /autoLogin \? browserLocalPersistence : browserSessionPersistence/);
  assert.match(repository, /if \(Platform\.OS === 'web'\)/);
  assert.ok(persistenceCall >= 0, 'Firebase persistence must be configured');
  assert.ok(persistenceFallback > persistenceCall, 'persistence failures must be handled');
  assert.ok(
    signInCall > persistenceFallback,
    'credentials must still be submitted when persistence is unavailable',
  );
});

test('login defaults to session-only persistence and exposes an accessible auto-login choice', () => {
  const authScreen = read('src/components/auth-screen.tsx');
  const formField = read('src/components/app/form-field.tsx');

  assert.match(authScreen, /const \[autoLogin, setAutoLogin\] = useState\(false\)/);
  assert.doesNotMatch(authScreen, /const \[autoLogin, setAutoLogin\] = useState\(true\)/);
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
