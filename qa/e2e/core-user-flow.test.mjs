import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { E2eMockBackend } from '../../src/qa/e2e-mock-backend.ts';
import { resolveChromeExecutablePath } from '../automation/browser.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(resolve(repositoryRoot, path), 'utf8');

test('E2E mock backend reproduces account creation, invite join, and returning login', () => {
  const backend = new E2eMockBackend();
  const password = 'fixture-value-not-a-real-credential';
  const owner = backend.signUp('owner@e2e.invalid', password, 'Owner QA');
  const created = backend.createHousehold(owner.profile, 'QA Household');
  const member = backend.signUp('member@e2e.invalid', password, 'Member QA');
  const joined = backend.joinHousehold(member.profile, created.snapshot.household.inviteCode);

  assert.equal(joined.snapshot.members.length, 2);
  assert.deepEqual(joined.snapshot.household.memberIds, [owner.profile.uid, member.profile.uid]);
  assert.equal(joined.snapshot.members[1].role, 'member');

  const returningOwner = backend.signIn('owner@e2e.invalid', password);
  assert.equal(returningOwner.snapshot.members[1].name, 'Member QA');
  assert.throws(() => backend.joinHousehold(member.profile, 'WRONG1'), /초대 코드/);
});

test('browser lookup honors an explicit path and falls back across platforms', () => {
  assert.equal(
    resolveChromeExecutablePath('/custom/chrome', (path) => path === '/custom/chrome'),
    '/custom/chrome',
  );
  assert.equal(
    resolveChromeExecutablePath('/missing/chrome', (path) => path === '/usr/bin/chromium'),
    '/usr/bin/chromium',
  );
  assert.throws(
    () => resolveChromeExecutablePath('/missing/chrome', () => false),
    /QA_CHROME_EXECUTABLE_PATH/,
  );
});

test('core flow smoke is registered and active features expose stable lifecycle selectors', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.scripts['qa:e2e'], 'node qa/e2e/run.mjs');
  assert.equal(packageJson.scripts['qa:core-flow-smoke'], 'node qa/e2e/core-user-flow.mjs');
  assert.match(packageJson.scripts['export:native'], /--platform ios[\s\S]*--platform android/);

  const expenses = read('src/app/expenses.tsx');
  const fridge = read('src/app/fridge.tsx');
  const calendar = read('src/app/calendar.tsx');
  assert.match(expenses, /testID="expense-add-button"/);
  assert.match(expenses, /testID="expense-delete-button"/);
  assert.match(expenses, /testID="monthly-budget-submit-button"/);
  assert.match(fridge, /testID="fridge-add-button"/);
  assert.match(fridge, /testID="fridge-delete-button"/);
  assert.match(calendar, /testID="calendar-event-save-button"/);
  assert.match(calendar, /accessibilityLabel=\{`\$\{event\.title\} 삭제`\}/);
});

test('platform smoke has explicit responsive, offline, and accessibility assertions', () => {
  const smoke = read('qa/e2e/core-user-flow.mjs');
  assert.match(smoke, /\[320, 402, 1440\]/);
  assert.match(smoke, /setOffline\(true\)/);
  assert.match(smoke, /findUnnamedInteractiveElements/);
  assert.match(read('src/components/network-status-banner.tsx'), /accessibilityRole="alert"/);
});
