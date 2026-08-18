import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';

const projectId = 'jalsarabose-rules-test';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
let environment;
let assertFails;
let assertSucceeds;
let doc;
let getDoc;
let initializeTestEnvironment;
let runTransaction;
let setDoc;
let updateDoc;
let saveMonthlyBudgetWithRevision;
let MonthlyBudgetConflictError;

before(async () => {
  if (!emulatorHost) return;
  ({ assertFails, assertSucceeds, initializeTestEnvironment } = await import('@firebase/rules-unit-testing'));
  ({ doc, getDoc, runTransaction, setDoc, updateDoc } = await import(
    'firebase/firestore'
  ));
  ({ saveMonthlyBudgetWithRevision, MonthlyBudgetConflictError } = await import(
    '../../src/services/monthly-budget-write.ts'
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

async function seedJoinableHousehold({ legacy = false, legacySecondMember = false } = {}) {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'households', 'home'), {
      createdBy: 'alice',
      inviteCode: 'JOINME',
      ...(legacy ? {} : { memberIds: ['alice'] }),
      name: 'Alice home',
    });
    await setDoc(doc(db, 'households', 'home', 'members', 'alice'), {
      householdId: 'home',
      userId: 'alice',
      role: 'admin',
      joinedAt: '2026-08-01',
    });
    if (legacySecondMember) {
      await setDoc(doc(db, 'households', 'home', 'members', 'bob'), {
        householdId: 'home',
        userId: 'bob',
        role: 'member',
        joinedAt: '2026-08-02',
        inviteCode: 'JOINME',
      });
    }
    await setDoc(doc(db, 'inviteCodes', 'JOINME'), {
      code: 'JOINME',
      householdId: 'home',
      createdBy: 'alice',
      createdAt: '2026-08-01',
    });
  });
}

function joinTransaction(db, uid = 'bob', { includeIndex = true, includeMember = true, joinedAt = '2026-08-19' } = {}) {
  return runTransaction(db, async (transaction) => {
    const householdRef = doc(db, 'households', 'home');
    const memberRef = doc(db, 'households', 'home', 'members', uid);
    const memberSnapshot = await transaction.get(memberRef);
    if (memberSnapshot.exists()) {
      transaction.set(doc(db, 'users', uid), {
        activeHouseholdId: 'home',
        updatedAt: joinedAt,
      }, { merge: true });
      return;
    }
    if (includeIndex) {
      transaction.update(householdRef, { memberIds: ['alice', uid] });
    }
    if (includeMember) {
      transaction.set(memberRef, {
        householdId: 'home',
        userId: uid,
        name: uid,
        role: 'member',
        joinedAt,
        inviteCode: 'JOINME',
      });
    }
    transaction.set(doc(db, 'users', uid), {
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
    revision: 1,
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

test('joining an existing household is idempotent and preserves member metadata', { skip: !emulatorHost }, async () => {
  await environment.clearFirestore();
  await seedJoinableHousehold();
  const db = environment.authenticatedContext('bob').firestore();
  await assertSucceeds(joinTransaction(db, 'bob', { joinedAt: '2026-08-19' }));
  await assertSucceeds(joinTransaction(db, 'bob', { joinedAt: '2099-01-01' }));

  const member = await getDoc(doc(db, 'households', 'home', 'members', 'bob'));
  assert.equal(member.data().joinedAt, '2026-08-19');
  assert.equal(member.data().role, 'member');
  assert.equal(member.data().inviteCode, 'JOINME');
});

test('an admin can migrate a legacy two-person household and its member can rejoin', { skip: !emulatorHost }, async () => {
  await environment.clearFirestore();
  await seedJoinableHousehold({ legacy: true, legacySecondMember: true });
  const bobDb = environment.authenticatedContext('bob').firestore();
  const aliceDb = environment.authenticatedContext('alice').firestore();

  await assertSucceeds(joinTransaction(bobDb));
  await assertSucceeds(updateDoc(doc(aliceDb, 'households', 'home'), { memberIds: ['alice', 'bob'] }));

  const household = await getDoc(doc(bobDb, 'households', 'home'));
  assert.deepEqual(household.data().memberIds, ['alice', 'bob']);
});

test('an admin can migrate a legacy one-person household before a genuine second member joins', { skip: !emulatorHost }, async () => {
  await environment.clearFirestore();
  await seedJoinableHousehold({ legacy: true });
  const aliceDb = environment.authenticatedContext('alice').firestore();
  const bobDb = environment.authenticatedContext('bob').firestore();

  await assertFails(joinTransaction(bobDb));
  await assertSucceeds(updateDoc(doc(aliceDb, 'households', 'home'), { memberIds: ['alice'] }));
  await assertSucceeds(joinTransaction(bobDb));

  const household = await getDoc(doc(bobDb, 'households', 'home'));
  assert.deepEqual(household.data().memberIds, ['alice', 'bob']);
});

test('a third party cannot take over a legacy two-person household through its invite code', { skip: !emulatorHost }, async () => {
  await environment.clearFirestore();
  await seedJoinableHousehold({ legacy: true, legacySecondMember: true });
  const db = environment.authenticatedContext('mallory').firestore();

  await assertFails(joinTransaction(db, 'mallory'));

  await environment.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    const household = await getDoc(doc(adminDb, 'households', 'home'));
    const existingMember = await getDoc(doc(adminDb, 'households', 'home', 'members', 'bob'));
    const attacker = await getDoc(doc(adminDb, 'households', 'home', 'members', 'mallory'));
    assert.equal('memberIds' in household.data(), false);
    assert.equal(existingMember.exists(), true);
    assert.equal(attacker.exists(), false);
  });
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
      revision: 2,
    }),
  );
  await assertFails(updateDoc(ref('2026-08'), { revision: 4 }));
  await assertFails(updateDoc(ref('2026-08'), { updatedBy: 'bob', revision: 3 }));
  await assertFails(updateDoc(ref('2026-08'), { createdBy: 'bob', revision: 3 }));
});

test('an existing non-admin member can migrate a legacy index while saving a budget', { skip: !emulatorHost }, async () => {
  await environment.clearFirestore();
  await seedJoinableHousehold({ legacy: true, legacySecondMember: true });
  const bobDb = environment.authenticatedContext('bob').firestore();

  await assertSucceeds(saveMonthlyBudgetWithRevision(
    bobDb,
    'home',
    budget({ createdBy: 'bob', updatedBy: 'bob' }),
    0,
  ));

  const household = await getDoc(doc(bobDb, 'households', 'home'));
  const savedBudget = await getDoc(doc(bobDb, 'households', 'home', 'monthlyBudgets', '2026-08'));
  assert.deepEqual(household.data().memberIds, ['alice', 'bob']);
  assert.equal(savedBudget.data().createdBy, 'bob');
});

test('concurrent creates keep one budget and report the stale writer as a conflict', { skip: !emulatorHost }, async () => {
  await environment.clearFirestore();
  await seedTwoMemberHousehold();
  const aliceDb = environment.authenticatedContext('alice').firestore();
  const bobDb = environment.authenticatedContext('bob').firestore();
  const aliceBudget = budget({ totalAmount: 200, memberContributions: { alice: 100, bob: 100 } });
  const bobBudget = budget({
    totalAmount: 300,
    memberContributions: { alice: 150, bob: 150 },
    createdBy: 'bob',
    updatedBy: 'bob',
  });

  const results = await Promise.allSettled([
    saveMonthlyBudgetWithRevision(aliceDb, 'home', aliceBudget, 0),
    saveMonthlyBudgetWithRevision(bobDb, 'home', bobBudget, 0),
  ]);

  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
  const rejection = results.find(({ status }) => status === 'rejected');
  assert.equal(rejection.reason?.name, 'MonthlyBudgetConflictError', String(rejection.reason));
  const saved = await getDoc(doc(aliceDb, 'households', 'home', 'monthlyBudgets', '2026-08'));
  assert.equal(saved.data().revision, 1);
  assert.ok([200, 300].includes(saved.data().totalAmount));
});

test('concurrent edits preserve the winner and reject rather than overwrite the stale edit', { skip: !emulatorHost }, async () => {
  await environment.clearFirestore();
  await seedTwoMemberHousehold();
  const aliceDb = environment.authenticatedContext('alice').firestore();
  const bobDb = environment.authenticatedContext('bob').firestore();
  await saveMonthlyBudgetWithRevision(aliceDb, 'home', budget(), 0);
  const aliceEdit = budget({
    totalAmount: 200,
    contributionMode: 'custom',
    memberContributions: { alice: 120, bob: 80 },
    updatedAt: '2026-08-19',
  });
  const bobEdit = budget({
    totalAmount: 300,
    contributionMode: 'custom',
    memberContributions: { alice: 170, bob: 130 },
    createdBy: 'bob',
    createdAt: '2099-01-01',
    updatedBy: 'bob',
    updatedAt: '2026-08-19',
  });

  const results = await Promise.allSettled([
    saveMonthlyBudgetWithRevision(aliceDb, 'home', aliceEdit, 1),
    saveMonthlyBudgetWithRevision(bobDb, 'home', bobEdit, 1),
  ]);

  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
  const rejection = results.find(({ status }) => status === 'rejected');
  assert.equal(rejection.reason?.name, 'MonthlyBudgetConflictError', String(rejection.reason));
  const saved = await getDoc(doc(aliceDb, 'households', 'home', 'monthlyBudgets', '2026-08'));
  assert.equal(saved.data().revision, 2);
  assert.ok([200, 300].includes(saved.data().totalAmount));
  assert.equal(saved.data().createdBy, 'alice');
  assert.equal(saved.data().createdAt, '2026-08-01');
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

  await assertFails(joinTransaction(db, 'bob', { includeMember: false }));
  await assertFails(joinTransaction(db, 'bob', { includeIndex: false }));
});

test('a third user cannot join or forge the household member index', { skip: !emulatorHost }, async () => {
  await environment.clearFirestore();
  await seedJoinableHousehold();
  await assertSucceeds(joinTransaction(environment.authenticatedContext('bob').firestore()));
  const db = environment.authenticatedContext('mallory').firestore();

  await assertFails(joinTransaction(db, 'mallory'));
  await assertFails(
    updateDoc(doc(db, 'households', 'home'), { memberIds: ['alice', 'mallory'] }),
  );
});

test('a member cannot rewrite security-sensitive household identity fields', { skip: !emulatorHost }, async () => {
  await environment.clearFirestore();
  await seedTwoMemberHousehold();
  const db = environment.authenticatedContext('bob').firestore();
  const householdRef = doc(db, 'households', 'home');

  await assertFails(updateDoc(householdRef, { createdBy: 'bob' }));
  await assertFails(updateDoc(householdRef, { inviteCode: 'TAKEOVER' }));
  await assertSucceeds(updateDoc(householdRef, { name: 'Our home' }));
});
