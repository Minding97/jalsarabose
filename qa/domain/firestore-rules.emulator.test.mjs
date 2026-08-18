import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';

const projectId = 'jalsarabose-rules-test';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
let environment;
let assertFails;
let assertSucceeds;
let arrayUnion;
let doc;
let getDoc;
let initializeTestEnvironment;
let runTransaction;
let setDoc;
let updateDoc;

before(async () => {
  if (!emulatorHost) return;
  ({ assertFails, assertSucceeds, initializeTestEnvironment } = await import('@firebase/rules-unit-testing'));
  ({ arrayUnion, doc, getDoc, runTransaction, setDoc, updateDoc } = await import(
    'firebase/firestore'
  ));
  const [host, port] = emulatorHost.split(':');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});

after(async () => {
  await environment?.cleanup();
});

async function seedTwoMemberHousehold() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'households', 'home'), { createdBy: 'alice', memberIds: ['alice', 'bob'] });
    for (const uid of ['alice', 'bob']) {
      await setDoc(doc(db, 'households', 'home', 'members', uid), {
        householdId: 'home', userId: uid, role: uid === 'alice' ? 'admin' : 'member', joinedAt: '2026-08-01',
      });
    }
  });
}

async function seedJoinableHousehold() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'households', 'home'), {
      createdBy: 'alice',
      inviteCode: 'JOINME',
      memberIds: ['alice'],
      name: 'Alice home',
    });
    await setDoc(doc(db, 'households', 'home', 'members', 'alice'), {
      householdId: 'home',
      userId: 'alice',
      role: 'admin',
      joinedAt: '2026-08-01',
    });
    await setDoc(doc(db, 'inviteCodes', 'JOINME'), {
      code: 'JOINME',
      householdId: 'home',
      createdBy: 'alice',
      createdAt: '2026-08-01',
    });
  });
}

function joinTransaction(db, { includeIndex = true, includeMember = true } = {}) {
  return runTransaction(db, async (transaction) => {
    if (includeIndex) {
      transaction.update(doc(db, 'households', 'home'), { memberIds: arrayUnion('bob') });
    }
    if (includeMember) {
      transaction.set(doc(db, 'households', 'home', 'members', 'bob'), {
        householdId: 'home',
        userId: 'bob',
        name: 'Bob',
        role: 'member',
        joinedAt: '2026-08-19',
        inviteCode: 'JOINME',
      });
    }
    transaction.set(doc(db, 'users', 'bob'), {
      activeHouseholdId: 'home',
      updatedAt: '2026-08-19',
    }, { merge: true });
  });
}

function budget(overrides = {}) {
  return {
    householdId: 'home',
    month: '2026-08',
    totalAmount: 101,
    contributionMode: 'equal',
    memberContributions: { alice: 51, bob: 50 },
    createdBy: 'alice',
    createdAt: '2026-08-01',
    updatedBy: 'alice',
    updatedAt: '2026-08-01',
    ...overrides,
  };
}

test('monthly budget rules allow members and reject outsiders', { skip: !emulatorHost }, async () => {
  await seedTwoMemberHousehold();
  const memberDb = environment.authenticatedContext('alice').firestore();
  const outsiderDb = environment.authenticatedContext('mallory').firestore();
  const budgetRef = doc(memberDb, 'households', 'home', 'monthlyBudgets', '2026-08');
  await assertSucceeds(setDoc(budgetRef, budget()));
  await assertSucceeds(getDoc(budgetRef));
  await assertFails(getDoc(doc(outsiderDb, 'households', 'home', 'monthlyBudgets', '2026-08')));
  await assertFails(
    setDoc(
      doc(outsiderDb, 'households', 'home', 'monthlyBudgets', '2026-09'),
      budget({ month: '2026-09' }),
    ),
  );
});

test('monthly budget rules enforce financial and identity invariants', { skip: !emulatorHost }, async () => {
  await environment.clearFirestore();
  await seedTwoMemberHousehold();
  const db = environment.authenticatedContext('alice').firestore();
  const ref = (month) => doc(db, 'households', 'home', 'monthlyBudgets', month);
  await assertFails(setDoc(ref('2026-09'), budget()));
  await assertFails(setDoc(ref('2026-08'), budget({ totalAmount: 100 })));
  await assertFails(setDoc(ref('2026-08'), budget({ totalAmount: 101.5 })));
  await assertFails(setDoc(ref('2026-08'), budget({ memberContributions: { alice: 50, bob: 51 } })));
  await assertFails(setDoc(ref('2026-08'), budget({ memberContributions: { alice: 51, mallory: 50 } })));
  await assertSucceeds(setDoc(ref('2026-08'), budget()));
  await assertFails(updateDoc(ref('2026-08'), { householdId: 'other' }));
  await assertSucceeds(
    updateDoc(ref('2026-08'), {
      contributionMode: 'custom',
      memberContributions: { alice: 60, bob: 41 },
    }),
  );
});

test('second member can join when the index and member document are created atomically', { skip: !emulatorHost }, async () => {
  await environment.clearFirestore();
  await seedJoinableHousehold();
  const db = environment.authenticatedContext('bob').firestore();

  await assertSucceeds(joinTransaction(db));

  const household = await getDoc(doc(db, 'households', 'home'));
  const member = await getDoc(doc(db, 'households', 'home', 'members', 'bob'));
  assert.deepEqual(household.data().memberIds, ['alice', 'bob']);
  assert.equal(member.data().userId, 'bob');
});

test('second-member authorization requires both sides of the existsAfter transaction', { skip: !emulatorHost }, async () => {
  await environment.clearFirestore();
  await seedJoinableHousehold();
  const db = environment.authenticatedContext('bob').firestore();

  await assertFails(joinTransaction(db, { includeMember: false }));
  await assertFails(joinTransaction(db, { includeIndex: false }));
});
