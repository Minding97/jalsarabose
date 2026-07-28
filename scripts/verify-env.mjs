import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const requiredFirebaseKeys = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];

const requiredBaseKeys = [
  'EXPO_PUBLIC_USE_MOCKS',
  'EXPO_PUBLIC_BACKEND_PROVIDER',
  ...requiredFirebaseKeys,
];

function parseEnvFile(filePath) {
  const env = {};

  if (!existsSync(filePath)) {
    return env;
  }

  const content = readFileSync(filePath, 'utf8');

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, '');

    env[key] = value;
  }

  return env;
}

function readFirebaseProjectId() {
  const firebaseRcPath = resolve('.firebaserc');

  if (!existsSync(firebaseRcPath)) {
    return null;
  }

  try {
    const firebaseRc = JSON.parse(readFileSync(firebaseRcPath, 'utf8'));
    return firebaseRc.projects?.default ?? null;
  } catch {
    return null;
  }
}

function maskPresence(value) {
  return value ? 'set' : 'missing';
}

const envExample = parseEnvFile(resolve('.env.example'));
const envLocal = parseEnvFile(resolve('.env.local'));
const mergedEnv = { ...process.env, ...envLocal };
const firebaseProjectId = readFirebaseProjectId();
const issues = [];
const warnings = [];

for (const key of requiredBaseKeys) {
  if (!(key in envExample)) {
    issues.push(`.env.example is missing ${key}.`);
  }
}

const useMocks = mergedEnv.EXPO_PUBLIC_USE_MOCKS === 'true';
const provider = mergedEnv.EXPO_PUBLIC_BACKEND_PROVIDER;

if (!existsSync(resolve('.env.local'))) {
  warnings.push('.env.local was not found. Create it from .env.example before live Firebase testing.');
}

if (provider && provider !== 'firebase') {
  issues.push(`EXPO_PUBLIC_BACKEND_PROVIDER must be "firebase" for the MVP, received "${provider}".`);
}

if (!useMocks) {
  for (const key of requiredFirebaseKeys) {
    if (!mergedEnv[key]) {
      issues.push(`${key} is required when EXPO_PUBLIC_USE_MOCKS=false.`);
    }
  }
}

if (firebaseProjectId && mergedEnv.EXPO_PUBLIC_FIREBASE_PROJECT_ID) {
  if (firebaseProjectId !== mergedEnv.EXPO_PUBLIC_FIREBASE_PROJECT_ID) {
    issues.push(
      `.firebaserc default project "${firebaseProjectId}" does not match EXPO_PUBLIC_FIREBASE_PROJECT_ID.`,
    );
  }
}

const summary = {
  useMocks: mergedEnv.EXPO_PUBLIC_USE_MOCKS || 'unset',
  backendProvider: provider || 'unset',
  firebaseProjectId: mergedEnv.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'unset',
  firebaseRcDefaultProject: firebaseProjectId || 'unset',
  firebaseKeys: Object.fromEntries(requiredFirebaseKeys.map((key) => [key, maskPresence(mergedEnv[key])])),
};

console.log('Firebase environment summary:');
console.log(JSON.stringify(summary, null, 2));

for (const warning of warnings) {
  console.warn(`Warning: ${warning}`);
}

if (issues.length > 0) {
  console.error('\nEnvironment verification failed:');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log('\nEnvironment verification passed.');
