import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  HOUSEHOLD_NAME_MAX_LENGTH,
  normalizeHouseholdName,
  validateHouseholdName,
} from '../../src/domain/household-settings.ts';

const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const readSource = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('household names share one normalized 2 to 30 character policy', () => {
  assert.equal(normalizeHouseholdName('  우리집  '), '우리집');
  assert.equal(validateHouseholdName('  우리집  '), null);
  assert.match(validateHouseholdName(' 집 ') ?? '', /2~30자/);
  assert.equal(validateHouseholdName('가'.repeat(HOUSEHOLD_NAME_MAX_LENGTH)), null);
  assert.match(validateHouseholdName('가'.repeat(HOUSEHOLD_NAME_MAX_LENGTH + 1)) ?? '', /2~30자/);
});

test('Firestore applies the name policy to onboarding creates and later renames', () => {
  const validator = rules.match(/function validHouseholdName\(name\) \{([\s\S]*?)\n    \}/)?.[1];
  const households = rules.match(/match \/households\/\{householdId\} \{([\s\S]*?)\n      match \/members/)?.[1];

  assert.ok(validator, 'validHouseholdName helper is missing');
  assert.match(validator, /name is string/);
  assert.match(validator, /name\.size\(\) >= 2/);
  assert.match(validator, /name\.size\(\) <= 30/);
  assert.ok(households, 'households rule block is missing');
  assert.equal(households.match(/validHouseholdName\(request\.resource\.data\.name\)/g)?.length, 2);
});

test('first entry offers create and join paths while profile rename reaches persistence', () => {
  const setupScreen = readSource('src/components/household-setup-screen.tsx');
  const profileSheet = readSource('src/components/profile-sheet.tsx');
  const store = readSource('src/store/household-store.ts');
  const repository = readSource('src/services/household-repository.ts');

  assert.match(setupScreen, /household-onboarding-create-button/);
  assert.match(setupScreen, /household-onboarding-join-button/);
  assert.match(setupScreen, /type SetupMode = 'choice' \| 'create' \| 'join'/);
  assert.match(profileSheet, /profile-household-name-edit-button/);
  assert.match(profileSheet, /profile-household-name-save-button/);
  assert.match(profileSheet, /await renameHousehold\(householdName\)/);
  assert.match(store, /renameHousehold: async \(name\)/);
  assert.match(store, /await updateHouseholdName\(requireHouseholdId\(state\), normalizedName\)/);
  assert.match(repository, /updateDoc\(doc\(requireDb\(\), 'households', householdId\)/);
});
