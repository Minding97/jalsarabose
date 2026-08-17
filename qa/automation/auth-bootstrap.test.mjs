import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const firebaseSource = readFileSync(new URL('../../src/services/firebase.ts', import.meta.url), 'utf8');
const storeSource = readFileSync(new URL('../../src/store/household-store.ts', import.meta.url), 'utf8');
const repositorySource = readFileSync(
  new URL('../../src/services/household-repository.ts', import.meta.url),
  'utf8',
);

test('web auth avoids the IndexedDB-first persistence path on WebKit', () => {
  assert.match(firebaseSource, /Platform\.OS === 'web'/);
  assert.match(
    firebaseSource,
    /persistence: \[browserLocalPersistence, browserSessionPersistence, inMemoryPersistence\]/,
  );
});

test('auth bootstrap cannot leave the app in checking forever', () => {
  assert.match(storeSource, /AUTH_INITIALIZATION_TIMEOUT_MS = 10_000/);
  assert.match(storeSource, /authStatus: 'unauthenticated'/);
  assert.match(storeSource, /Safari에서 로그인 저장소 확인이 지연됐어요/);
  assert.match(repositorySource, /onAuthStateChanged\(requireAuth\(\), callback, onError\)/);
});
