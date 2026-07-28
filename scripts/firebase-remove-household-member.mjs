import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectId = process.env.FIREBASE_PROJECT_ID;
const householdId = process.env.HOUSEHOLD_ID;
const userId = process.env.USER_UID;
const expectedEmail = process.env.EXPECTED_USER_EMAIL?.trim().toLowerCase();
const applyChanges = process.env.APPLY === 'true';

if (!projectId || !householdId || !userId || !expectedEmail) {
  fail('FIREBASE_PROJECT_ID, HOUSEHOLD_ID, USER_UID, and EXPECTED_USER_EMAIL are required.');
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
const user = await getDocument(`users/${userId}`);
const member = await getDocument(`households/${householdId}/members/${userId}`);

assert(
  user.fields?.email?.stringValue?.toLowerCase() === expectedEmail,
  'User email does not match the expected account.',
);
assert(member.fields?.role?.stringValue === 'member', 'Only a non-admin member can be removed.');
assert(
  member.fields?.householdId?.stringValue === householdId,
  'Member does not belong to the expected household.',
);

console.log(`Member: ${user.fields.email.stringValue} (${userId})`);
console.log(`Household: ${householdId}`);

if (!applyChanges) {
  console.log('Safety checks passed. No changes applied.');
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
const response = await request(`${databaseRoot}/documents:commit`, {
  method: 'POST',
  body: JSON.stringify({
    writes: [
      {
        update: {
          name: user.name,
          fields: {
            ...user.fields,
            activeHouseholdId: { nullValue: null },
            updatedAt: { stringValue: today },
          },
        },
      },
      { delete: member.name },
    ],
  }),
});

assert(Array.isArray(response.writeResults), 'Firestore commit did not return write results.');
console.log('Household member removal completed.');

async function getDocument(path) {
  return request(`${documentsRoot}/${path}`);
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

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
