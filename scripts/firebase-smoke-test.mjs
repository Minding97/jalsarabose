import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
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

const localEnv = readLocalEnv();
for (const [key, value] of Object.entries(localEnv)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

const email = process.env.SMOKE_TEST_EMAIL;
const password = process.env.SMOKE_TEST_PASSWORD;
const inviteEmail = process.env.SMOKE_INVITE_EMAIL;
const invitePassword = process.env.SMOKE_INVITE_PASSWORD;
const shouldCreateInviteUser = process.env.SMOKE_INVITE_CREATE === 'true';

if (!email || !password) {
  fail('SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD are required.');
}

const missingKeys = REQUIRED_FIREBASE_ENV.filter((key) => !process.env[key]);
if (missingKeys.length > 0) {
  fail(`Missing Firebase env values: ${missingKeys.join(', ')}`);
}

if (process.env.EXPO_PUBLIC_USE_MOCKS === 'true') {
  fail('EXPO_PUBLIC_USE_MOCKS must be false for Firebase smoke tests.');
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
  const user = credential.user;
  const today = todayIso();

  console.log(`Signed in: ${user.email}`);
  await upsertUserProfile(user, today);

  const householdId = await ensureHousehold(user, today);
  const householdSnapshot = await getDoc(doc(db, 'households', householdId));

  if (!householdSnapshot.exists()) {
    fail(`Household not found after setup: ${householdId}`);
  }

  const household = householdSnapshot.data();
  console.log(`Household ready: ${household.name} (${householdId})`);
  console.log(`Invite code ready: ${household.inviteCode}`);

  await assertReadableHouseholdCollections(householdId);
  await cleanupUiSmokeArtifacts(householdId);
  await exerciseCrud(householdId, user.uid, today);
  await exerciseInviteJoin({
    ownerUid: user.uid,
    householdId,
    inviteCode: household.inviteCode,
    today,
  });

  await signOut(auth);
  console.log('Firebase smoke test passed.');
} catch (error) {
  fail(getErrorMessage(error));
}

async function upsertUserProfile(user, today) {
  const userRef = doc(db, 'users', user.uid);
  const existing = await getDoc(userRef);
  const data = {
    uid: user.uid,
    email: user.email ?? '',
    updatedAt: today,
  };

  if (!existing.exists()) {
    data.displayName = user.email ?? '';
    data.activeHouseholdId = null;
    data.createdAt = today;
  }

  await setDoc(userRef, data, { merge: true });
  console.log('User profile readable/writable.');
}

async function ensureHousehold(user, today) {
  const userRef = doc(db, 'users', user.uid);
  const userSnapshot = await getDoc(userRef);
  const activeHouseholdId = userSnapshot.data()?.activeHouseholdId;

  if (activeHouseholdId) {
    const householdSnapshot = await getDoc(doc(db, 'households', activeHouseholdId));
    const memberSnapshot = await getDoc(
      doc(db, 'households', activeHouseholdId, 'members', user.uid),
    );

    if (householdSnapshot.exists() && memberSnapshot.exists()) {
      return activeHouseholdId;
    }
  }

  const householdRef = doc(collection(db, 'households'));
  const inviteCode = createInviteCode();

  await runTransaction(db, async (transaction) => {
    const inviteRef = doc(db, 'inviteCodes', inviteCode);
    const inviteSnapshot = await transaction.get(inviteRef);

    if (inviteSnapshot.exists()) {
      throw new Error('Invite code collision. Run the smoke test again.');
    }

    transaction.set(householdRef, {
      name: 'Codex Smoke Test Household',
      inviteCode,
      createdBy: user.uid,
      createdAt: today,
    });
    transaction.set(doc(db, 'households', householdRef.id, 'members', user.uid), {
      householdId: householdRef.id,
      userId: user.uid,
      name: user.email ?? 'Smoke Tester',
      role: 'admin',
      joinedAt: today,
      inviteCode,
    });
    transaction.set(inviteRef, {
      code: inviteCode,
      householdId: householdRef.id,
      createdBy: user.uid,
      createdAt: today,
    });
    transaction.set(
      userRef,
      {
        activeHouseholdId: householdRef.id,
        updatedAt: today,
      },
      { merge: true },
    );
  });

  console.log('Created smoke-test household because the user had no active household.');
  return householdRef.id;
}

async function assertReadableHouseholdCollections(householdId) {
  const collections = ['members', 'expenses', 'chores', 'fridgeItems'];

  for (const name of collections) {
    await getDocs(query(collection(db, 'households', householdId, name), limit(1)));
    console.log(`Readable collection: ${name}`);
  }
}

async function cleanupUiSmokeArtifacts(householdId) {
  const uiSmokeExpenses = await getDocs(
    query(
      collection(db, 'households', householdId, 'expenses'),
      where('title', '==', '[ui smoke] 관리비'),
      limit(10),
    ),
  );

  for (const snapshot of uiSmokeExpenses.docs) {
    await deleteDoc(snapshot.ref);
  }

  if (!uiSmokeExpenses.empty) {
    console.log(`Cleaned ${uiSmokeExpenses.size} UI smoke expense item(s).`);
  }
}

async function exerciseCrud(householdId, uid, today) {
  const expenseRef = await addDoc(collection(db, 'households', householdId, 'expenses'), {
    householdId,
    title: '[smoke] 수도요금',
    category: 'utilities',
    amount: 12000,
    dueDate: today,
    paymentMethod: 'test',
    payerId: uid,
    isRecurring: false,
    status: 'scheduled',
    memo: 'created by firebase smoke test',
    createdBy: uid,
    createdAt: today,
    notificationEnabled: true,
  });
  await assertDenied(
    () => updateDoc(expenseRef, { householdId: `invalid-${householdId}` }),
    () => updateDoc(expenseRef, { householdId }),
    'Expense householdId mutation should be denied.',
  );
  await updateDoc(expenseRef, { status: 'paid' });
  await getDocs(
    query(collection(db, 'households', householdId, 'expenses'), orderBy('dueDate', 'asc'), limit(3)),
  );
  await deleteDoc(expenseRef);
  console.log('Expense create/update/query/delete passed.');

  const choreRef = await addDoc(collection(db, 'households', householdId, 'chores'), {
    householdId,
    title: '[smoke] 분리수거',
    assigneeId: uid,
    dueDate: today,
    repeatCycle: 'none',
    score: 1,
    status: 'scheduled',
    memo: 'created by firebase smoke test',
    createdBy: uid,
    createdAt: today,
    notificationEnabled: true,
  });
  await assertDenied(
    () => updateDoc(choreRef, { householdId: `invalid-${householdId}` }),
    () => updateDoc(choreRef, { householdId }),
    'Chore householdId mutation should be denied.',
  );
  await updateDoc(choreRef, { status: 'done' });
  await getDocs(
    query(collection(db, 'households', householdId, 'chores'), orderBy('dueDate', 'asc'), limit(3)),
  );
  await deleteDoc(choreRef);
  console.log('Chore create/update/query/delete passed.');

  const fridgeRef = await addDoc(collection(db, 'households', householdId, 'fridgeItems'), {
    householdId,
    name: '[smoke] 우유',
    category: 'dairy',
    quantity: '1개',
    storageType: 'fridge',
    expiryDate: today,
    status: 'stocked',
    memo: 'created by firebase smoke test',
    createdBy: uid,
    createdAt: today,
    notificationEnabled: true,
  });
  await assertDenied(
    () => updateDoc(fridgeRef, { householdId: `invalid-${householdId}` }),
    () => updateDoc(fridgeRef, { householdId }),
    'Fridge item householdId mutation should be denied.',
  );
  await updateDoc(fridgeRef, { status: 'used' });
  await getDocs(
    query(
      collection(db, 'households', householdId, 'fridgeItems'),
      orderBy('createdAt', 'desc'),
      limit(3),
    ),
  );
  await deleteDoc(fridgeRef);
  console.log('Fridge item create/update/query/delete passed.');
}

async function exerciseInviteJoin({ ownerUid, householdId, inviteCode, today }) {
  if (!inviteEmail && !invitePassword) {
    console.log('Invite join skipped: set SMOKE_INVITE_EMAIL and SMOKE_INVITE_PASSWORD to verify it.');
    return;
  }

  if (!inviteEmail || !invitePassword) {
    fail('Both SMOKE_INVITE_EMAIL and SMOKE_INVITE_PASSWORD are required for invite join verification.');
  }

  if (inviteEmail.trim().toLowerCase() === email.trim().toLowerCase()) {
    fail('SMOKE_INVITE_EMAIL must be different from SMOKE_TEST_EMAIL.');
  }

  await signOut(auth);
  const inviteCredential = await signInOrCreateInviteUser();
  const inviteUser = inviteCredential.user;

  await upsertUserProfile(inviteUser, today);

  const memberRef = doc(db, 'households', householdId, 'members', inviteUser.uid);
  const inviteUserProfileBeforeJoin = await getDoc(doc(db, 'users', inviteUser.uid));

  if (inviteUserProfileBeforeJoin.data()?.activeHouseholdId !== householdId) {
    console.log('Creating invite member document.');
    try {
      await runTransaction(db, async (transaction) => {
        transaction.set(memberRef, {
          householdId,
          userId: inviteUser.uid,
          name: inviteUser.email ?? 'Invite Smoke Tester',
          role: 'member',
          joinedAt: today,
          inviteCode,
        });
        transaction.set(
          doc(db, 'users', inviteUser.uid),
          {
            activeHouseholdId: householdId,
            updatedAt: today,
          },
          { merge: true },
        );
      });
      console.log('Invite member document created.');
    } catch (error) {
      throw new Error(`Invite member transaction failed: ${getErrorMessage(error)}`);
    }
  } else {
    console.log('Invite user is already linked to the household.');
  }

  console.log('Reading invite member document.');
  const verifiedMember = await getDoc(memberRef);
  console.log('Reading invite user profile.');
  const inviteUserProfile = await getDoc(doc(db, 'users', inviteUser.uid));

  if (!verifiedMember.exists()) {
    fail('Invite member document was not created.');
  }

  if (inviteUserProfile.data()?.activeHouseholdId !== householdId) {
    fail('Invite user profile was not linked to the household.');
  }

  await getDoc(doc(db, 'households', householdId));
  await getDocs(query(collection(db, 'households', householdId, 'members'), limit(10)));
  console.log('Verifying invite member cannot become admin.');
  await assertDenied(
    () => updateDoc(memberRef, { role: 'admin' }),
    () => updateDoc(memberRef, { role: 'member' }),
    'Invite member role escalation should be denied.',
  );
  await exerciseInviteMemberCrud(householdId, inviteUser.uid, today);
  console.log(`Invite join passed for ${inviteUser.email}; owner ${ownerUid} remains household admin.`);
}

async function signInOrCreateInviteUser() {
  try {
    return await signInWithEmailAndPassword(auth, inviteEmail.trim(), invitePassword);
  } catch (error) {
    const code = error?.code ?? '';
    const canCreate =
      shouldCreateInviteUser &&
      (code === 'auth/invalid-credential' ||
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password');

    if (!canCreate) {
      throw error;
    }

    console.log(`Invite user sign-in failed with ${code}; creating test invite user.`);
    return createUserWithEmailAndPassword(auth, inviteEmail.trim(), invitePassword);
  }
}

async function exerciseInviteMemberCrud(householdId, uid, today) {
  const expenseRef = await addDoc(collection(db, 'households', householdId, 'expenses'), {
    householdId,
    title: '[smoke invite] 공동 장보기',
    category: 'living',
    amount: 9000,
    dueDate: today,
    paymentMethod: 'test',
    payerId: uid,
    isRecurring: false,
    status: 'scheduled',
    memo: 'created by invite smoke test',
    createdBy: uid,
    createdAt: today,
    notificationEnabled: true,
  });
  await deleteDoc(expenseRef);
  console.log('Invite member CRUD passed.');
}

async function assertDenied(action, cleanup, message) {
  try {
    await action();
  } catch {
    console.log(`Denied as expected: ${message}`);
    return;
  }

  await cleanup();
  fail(message);
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
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
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
