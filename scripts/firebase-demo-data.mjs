import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  where,
} from 'firebase/firestore';

const REQUIRED_FIREBASE_ENV = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];

const DEMO_MARKER = '[codex-demo-data]';
const shouldResetOnly = process.argv.includes('--reset-only');
const shouldSeedOnly = process.argv.includes('--seed-only');

const localEnv = readLocalEnv();
for (const [key, value] of Object.entries(localEnv)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

const email = process.env.DEMO_TEST_EMAIL ?? process.env.SMOKE_TEST_EMAIL;
const password = process.env.DEMO_TEST_PASSWORD ?? process.env.SMOKE_TEST_PASSWORD;

if (!email || !password) {
  fail('DEMO_TEST_EMAIL/DEMO_TEST_PASSWORD or SMOKE_TEST_EMAIL/SMOKE_TEST_PASSWORD are required.');
}

const missingKeys = REQUIRED_FIREBASE_ENV.filter((key) => !process.env[key]);
if (missingKeys.length > 0) {
  fail(`Missing Firebase env values: ${missingKeys.join(', ')}`);
}

if (process.env.EXPO_PUBLIC_USE_MOCKS === 'true') {
  fail('EXPO_PUBLIC_USE_MOCKS must be false for Firebase demo data scripts.');
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
  const uid = credential.user.uid;
  const userSnapshot = await getDoc(doc(db, 'users', uid));
  const householdId = userSnapshot.data()?.activeHouseholdId;

  if (!householdId) {
    fail('The signed-in user has no active household. Create or join a household first.');
  }

  const memberSnapshot = await getDoc(doc(db, 'households', householdId, 'members', uid));
  if (!memberSnapshot.exists()) {
    fail('The signed-in user is not a member of the active household.');
  }

  if (!shouldSeedOnly) {
    await resetDemoData(householdId);
  }

  if (!shouldResetOnly) {
    await seedDemoData(householdId, uid);
  }

  await signOut(auth);
  console.log('Firebase demo data script passed.');
} catch (error) {
  fail(getErrorMessage(error));
}

async function resetDemoData(householdId) {
  const targets = [
    ['expenses', 'title'],
    ['chores', 'title'],
    ['fridgeItems', 'name'],
  ];
  let deletedCount = 0;

  for (const [collectionName] of targets) {
    const snapshots = await getDocs(
      query(
        collection(db, 'households', householdId, collectionName),
        where('memo', '==', DEMO_MARKER),
        limit(50),
      ),
    );

    for (const snapshot of snapshots.docs) {
      await deleteDoc(snapshot.ref);
      deletedCount += 1;
    }
  }

  console.log(`Removed ${deletedCount} demo item(s).`);
}

async function seedDemoData(householdId, uid) {
  const today = todayIso();
  const tomorrow = addDaysIso(1);
  const threeDaysLater = addDaysIso(3);
  const nextWeek = addDaysIso(7);

  await addDoc(collection(db, 'households', householdId, 'expenses'), {
    householdId,
    title: '[demo] 관리비',
    category: 'utilities',
    amount: 185000,
    dueDate: threeDaysLater,
    paymentMethod: '생활비 계좌',
    payerId: uid,
    isRecurring: false,
    status: 'scheduled',
    memo: DEMO_MARKER,
    createdBy: uid,
    createdAt: today,
    notificationEnabled: true,
  });

  await addDoc(collection(db, 'households', householdId, 'expenses'), {
    householdId,
    title: '[demo] 장보기',
    category: 'living',
    amount: 42000,
    dueDate: today,
    paymentMethod: '체크카드',
    payerId: uid,
    isRecurring: false,
    status: 'paid',
    memo: DEMO_MARKER,
    createdBy: uid,
    createdAt: today,
    notificationEnabled: false,
  });

  await addDoc(collection(db, 'households', householdId, 'chores'), {
    householdId,
    title: '[demo] 분리수거',
    assigneeId: uid,
    dueDate: tomorrow,
    repeatCycle: 'weekly',
    score: 2,
    status: 'scheduled',
    memo: DEMO_MARKER,
    createdBy: uid,
    createdAt: today,
    notificationEnabled: true,
  });

  await addDoc(collection(db, 'households', householdId, 'chores'), {
    householdId,
    title: '[demo] 욕실 청소',
    assigneeId: uid,
    dueDate: today,
    repeatCycle: 'none',
    score: 3,
    status: 'done',
    memo: DEMO_MARKER,
    createdBy: uid,
    createdAt: today,
    notificationEnabled: false,
  });

  await addDoc(collection(db, 'households', householdId, 'fridgeItems'), {
    householdId,
    name: '[demo] 우유',
    category: 'dairy',
    quantity: '1팩',
    storageType: 'fridge',
    expiryDate: tomorrow,
    status: 'stocked',
    memo: DEMO_MARKER,
    createdBy: uid,
    createdAt: today,
    notificationEnabled: true,
  });

  await addDoc(collection(db, 'households', householdId, 'fridgeItems'), {
    householdId,
    name: '[demo] 냉동만두',
    category: 'frozen',
    quantity: '1봉',
    storageType: 'freezer',
    expiryDate: nextWeek,
    status: 'stocked',
    memo: DEMO_MARKER,
    createdBy: uid,
    createdAt: today,
    notificationEnabled: true,
  });

  console.log('Seeded 6 demo item(s).');
}

function readLocalEnv() {
  const envPath = resolve(process.cwd(), '.env.local');
  try {
    const raw = readFileSync(envPath, 'utf8');
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .reduce((env, line) => {
        const index = line.indexOf('=');
        if (index === -1) {
          return env;
        }

        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
        env[key] = value;
        return env;
      }, {});
  } catch {
    return {};
  }
}

function todayIso() {
  return toIsoDate(new Date());
}

function addDaysIso(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
