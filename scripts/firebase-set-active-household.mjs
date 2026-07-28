import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getFirestore, setDoc } from 'firebase/firestore';

const localEnv = readLocalEnv();
for (const [key, value] of Object.entries(localEnv)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

const email = process.env.TEST_ACCOUNT_EMAIL;
const password = process.env.TEST_ACCOUNT_PASSWORD;
const activeHouseholdId = process.env.ACTIVE_HOUSEHOLD_ID?.trim() || null;

if (!email || !password) {
  fail('TEST_ACCOUNT_EMAIL and TEST_ACCOUNT_PASSWORD are required.');
}

const app = initializeApp({
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
});

const auth = getAuth(app);
const db = getFirestore(app);

try {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  await setDoc(
    doc(db, 'users', credential.user.uid),
    {
      activeHouseholdId,
      updatedAt: todayIso(),
    },
    { merge: true },
  );
  await signOut(auth);
  console.log(
    activeHouseholdId
      ? `Active household restored: ${activeHouseholdId}`
      : 'Active household cleared for UI verification.',
  );
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

function readLocalEnv() {
  try {
    const source = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    return Object.fromEntries(
      source
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
          const separator = line.indexOf('=');
          const key = separator === -1 ? line : line.slice(0, separator);
          const value = separator === -1 ? '' : line.slice(separator + 1);
          return [key.trim(), value.trim().replace(/^['"]|['"]$/g, '')];
        }),
    );
  } catch {
    return {};
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
