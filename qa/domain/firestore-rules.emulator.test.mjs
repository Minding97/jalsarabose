import { readFile } from 'node:fs/promises';
import test, { after, before } from 'node:test';

const projectId = 'jalsarabose-rules-test';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
let environment;
let assertFails;
let assertSucceeds;
let doc;
let getDoc;
let initializeTestEnvironment;
let setDoc;
let updateDoc;

before(async () => {
  if (!emulatorHost) return;
  ({ assertFails, assertSucceeds, initializeTestEnvironment } = await import('@firebase/rules-unit-testing'));
  ({ doc, getDoc, setDoc, updateDoc } = await import('firebase/firestore'));
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
