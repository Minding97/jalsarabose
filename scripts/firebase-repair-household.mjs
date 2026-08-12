import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectId = process.env.FIREBASE_PROJECT_ID;
const sourceHouseholdId = process.env.SOURCE_HOUSEHOLD_ID;
const targetHouseholdId = process.env.TARGET_HOUSEHOLD_ID;
const userId = process.env.USER_UID;
const expectedEmail = process.env.EXPECTED_USER_EMAIL?.trim().toLowerCase();
const applyChanges = process.env.APPLY === 'true';

if (!projectId || !sourceHouseholdId || !targetHouseholdId || !userId || !expectedEmail) {
  fail(
    'FIREBASE_PROJECT_ID, SOURCE_HOUSEHOLD_ID, TARGET_HOUSEHOLD_ID, USER_UID, and EXPECTED_USER_EMAIL are required.',
  );
}

const firebaseToolsConfig = JSON.parse(
  readFileSync(resolve(process.env.HOME, '.config/configstore/firebase-tools.json'), 'utf8'),
);
const accessToken = firebaseToolsConfig.tokens?.access_token;

if (!accessToken || Number(firebaseToolsConfig.tokens?.expires_at ?? 0) <= Date.now()) {
  fail('Firebase CLI access token is missing or expired. Run a Firebase CLI command first.');
}

const databaseRoot = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`;
const documentsRoot = `${databaseRoot}/documents`;
const documentResourceRoot = `projects/${projectId}/databases/(default)/documents`;
const sourceHousehold = await getDocument(`households/${sourceHouseholdId}`);
const targetHousehold = await getDocument(`households/${targetHouseholdId}`);
const user = await getDocument(`users/${userId}`);
const sourceMembers = await listDocuments(`households/${sourceHouseholdId}/members`);
const sourceExpenses = await listDocuments(`households/${sourceHouseholdId}/expenses`);
const sourceRetiredFeatureRecords = await listDocuments(
  `households/${sourceHouseholdId}/chores`,
);
const sourceFridgeItems = await listDocuments(`households/${sourceHouseholdId}/fridgeItems`);
const sourceInviteCode = sourceHousehold.fields?.inviteCode?.stringValue;
const sourceInvite = await getDocument(`inviteCodes/${sourceInviteCode}`);
const targetInviteCode = targetHousehold.fields?.inviteCode?.stringValue;

assert(sourceHousehold.fields?.createdBy?.stringValue === userId, 'Source household creator mismatch.');
assert(
  user.fields?.email?.stringValue?.toLowerCase() === expectedEmail,
  'User email does not match the expected account.',
);
assert(
  user.fields?.activeHouseholdId?.stringValue === sourceHouseholdId,
  'User is no longer connected to the source household.',
);
assert(
  sourceInvite.fields?.householdId?.stringValue === sourceHouseholdId,
  'Source invite code does not point to the source household.',
);
assert(Boolean(targetInviteCode), 'Target household has no invite code.');
assert(sourceMembers.length === 1, 'Source household has more than one member.');
assert(documentId(sourceMembers[0]) === userId, 'Source household member is not the expected user.');
assert(sourceExpenses.length === 0, 'Source household contains expenses.');
assert(
  sourceRetiredFeatureRecords.length === 0,
  'Source household contains preserved records for a retired feature.',
);
assert(sourceFridgeItems.length === 0, 'Source household contains fridge items.');

console.log(`Source household: ${sourceHousehold.fields.name.stringValue} (${sourceHouseholdId})`);
console.log(`Target household: ${targetHousehold.fields.name.stringValue} (${targetHouseholdId})`);
console.log(`User: ${user.fields.email.stringValue} (${userId})`);
console.log('Source contents: 1 member, 0 expenses, 0 retired records, 0 fridge items.');

if (!applyChanges) {
  console.log('Safety checks passed. No changes applied.');
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
const targetMemberName =
  user.fields?.displayName?.stringValue || user.fields?.email?.stringValue || expectedEmail;
const response = await request(`${databaseRoot}/documents:commit`, {
  method: 'POST',
  body: JSON.stringify({
    writes: [
      {
        update: {
          name: user.name,
          fields: {
            ...user.fields,
            activeHouseholdId: { stringValue: targetHouseholdId },
            updatedAt: { stringValue: today },
          },
        },
      },
      {
        update: {
          name: `${documentResourceRoot}/households/${targetHouseholdId}/members/${userId}`,
          fields: {
            householdId: { stringValue: targetHouseholdId },
            userId: { stringValue: userId },
            name: { stringValue: targetMemberName },
            role: { stringValue: 'member' },
            joinedAt: { stringValue: today },
            inviteCode: { stringValue: targetInviteCode },
          },
        },
      },
      { delete: sourceMembers[0].name },
      { delete: sourceInvite.name },
      { delete: sourceHousehold.name },
    ],
  }),
});

assert(Array.isArray(response.writeResults), 'Firestore commit did not return write results.');
console.log('Household repair completed.');

async function getDocument(path) {
  return request(`${documentsRoot}/${path}`);
}

async function listDocuments(path) {
  const response = await request(`${documentsRoot}/${path}?pageSize=100`);
  return response.documents ?? [];
}

async function request(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const payload = await response.json();

  if (!response.ok) {
    fail(payload.error?.message ?? `Firebase request failed with ${response.status}.`);
  }

  return payload;
}

function documentId(document) {
  return document.name.split('/').at(-1);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
