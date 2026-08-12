import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(resolve(repositoryRoot, path), 'utf8');

function sourceFiles(directory) {
  return readdirSync(resolve(repositoryRoot, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

test('retired domain is absent from active application code', () => {
  const approvedCompatibilityFiles = new Set([
    'src/components/app-tabs.tsx',
    'src/services/notification-service.ts',
  ]);
  const unexpectedReferences = sourceFiles('src')
    .filter((path) => !approvedCompatibilityFiles.has(relative('.', path)))
    .filter((path) => /\bchores?\b|집안일/i.test(read(path)));

  assert.deepEqual(unexpectedReferences, []);
  assert.doesNotMatch(read('src/domain/types.ts'), /\bChore|\bchores\b/);
  assert.doesNotMatch(read('src/services/household-repository.ts'), /\bchores\b/);
  assert.doesNotMatch(read('src/data/seed.ts'), /\bchores\b/);
});

test('expense, fridge, calendar, and memo data remain wired', () => {
  const types = read('src/domain/types.ts');
  const repository = read('src/services/household-repository.ts');
  const dashboard = read('src/utils/dashboard.ts');

  assert.match(types, /export type Expense = \{[\s\S]*?memo\?: string;/);
  assert.match(types, /export type FridgeItem = \{[\s\S]*?memo\?: string;/);
  assert.match(repository, /householdId, 'expenses'/);
  assert.match(repository, /householdId, 'fridgeItems'/);
  assert.match(dashboard, /snapshot\.expenses\.map/);
  assert.match(dashboard, /snapshot\.fridgeItems/);
  assert.match(read('src/app/calendar.tsx'), /getCalendarEvents\(snapshot\)/);
});

test('legacy deep link is hidden and redirects home without loading feature state', () => {
  const route = read('src/app/chores.tsx');
  const tabs = read('src/components/app-tabs.tsx');

  assert.match(route, /<Redirect href="\/" \/>/);
  assert.doesNotMatch(route, /useHouseholdStore|Firestore|notification/i);
  assert.match(tabs, /name="chores"[\s\S]*?href: null/);
  assert.doesNotMatch(tabs, />집안일</);
  assert.match(read('sites/worker.js'), /['"]\/chores['"]/);
});

test('preserved records are closed and old local notifications are cancelled', () => {
  const rules = read('firestore.rules');
  const notifications = read('src/services/notification-service.ts');

  assert.match(
    rules,
    /match \/chores\/\{recordId\} \{[\s\S]*?allow read, write: if false;[\s\S]*?\}/,
  );
  assert.match(notifications, /RETIRED_NOTIFICATION_PREFIX = 'chore-'/);
  assert.match(notifications, /getAllScheduledNotificationsAsync/);
  assert.match(notifications, /cancelScheduledNotificationAsync/);
  assert.doesNotMatch(read('scripts/firebase-demo-data.mjs'), /['"]chores['"]/);
});

test('retirement policy defines preservation, rollout, and rollback safeguards', () => {
  const policy = read('docs/retired-feature-policy.md');

  assert.match(policy, /최소 90일간 보존/);
  assert.match(policy, /클라이언트보다 먼저 배포하지 않는다/);
  assert.match(policy, /먼저 직전의 가구원 범위 규칙을 복원/);
  assert.match(policy, /별도 데이터 삭제 티켓/);
});
