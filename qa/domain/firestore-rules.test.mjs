import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const monthlyBudgetValidator = rules.match(
  /function validMonthlyBudget\(householdId\) \{([\s\S]*?)\n    \}/,
)?.[1];

test('monthly budget rules enforce the documented financial invariants', () => {
  assert.ok(monthlyBudgetValidator, 'validMonthlyBudget helper is missing');

  assert.match(monthlyBudgetValidator, /getAfter\(householdPath\(householdId\)\)/);
  assert.match(monthlyBudgetValidator, /memberIds\.size\(\) == 2/);
  assert.match(monthlyBudgetValidator, /exists\(memberPath\(householdId, memberIds\[0\]\)\)/);
  assert.match(monthlyBudgetValidator, /exists\(memberPath\(householdId, memberIds\[1\]\)\)/);
  assert.match(monthlyBudgetValidator, /totalAmount is int/);
  assert.match(monthlyBudgetValidator, /totalAmount > 0/);
  assert.match(monthlyBudgetValidator, /contributions is map/);
  assert.match(monthlyBudgetValidator, /contributions\.keys\(\)\.size\(\) == 2/);
  assert.match(monthlyBudgetValidator, /contributions\.keys\(\)\.hasAll\(memberIds\)/);
  assert.match(monthlyBudgetValidator, /firstContribution is int/);
  assert.match(monthlyBudgetValidator, /secondContribution is int/);
  assert.match(monthlyBudgetValidator, /firstContribution >= 0/);
  assert.match(monthlyBudgetValidator, /secondContribution >= 0/);
  assert.match(monthlyBudgetValidator, /firstContribution \+ secondContribution == request\.resource\.data\.totalAmount/);
  assert.match(monthlyBudgetValidator, /firstContribution >= secondContribution/);
  assert.match(monthlyBudgetValidator, /firstContribution - secondContribution <= 1/);
});

test('monthly budget creates and updates both call the invariant validator', () => {
  const monthlyBudgetMatch = rules.match(
    /match \/monthlyBudgets\/\{month\} \{([\s\S]*?)\n      \}/,
  )?.[1];

  assert.ok(monthlyBudgetMatch, 'monthlyBudgets rule block is missing');
  assert.equal(monthlyBudgetMatch.match(/validMonthlyBudget\(householdId\)/g)?.length, 2);
});

test('the authoritative member index is guarded while legacy two-member households can migrate', () => {
  assert.match(rules, /createsInitialHouseholdMemberIndex\(\)/);
  assert.match(rules, /requesterIsIndexedAfterWrite\(householdId\)/);
  assert.match(rules, /function initializesLegacyHouseholdMemberIndex\(householdId\)/);
  assert.match(rules, /&& 'memberIds' in resource\.data/);
  assert.match(rules, /!\('memberIds' in resource\.data\)/);
  assert.match(rules, /memberIds\[0\] == resource\.data\.createdBy/);
  assert.match(rules, /memberIds\.size\(\) >= 1/);
  assert.match(rules, /exists\(memberPath\(householdId, memberIds\[1\]\)\)/);
  assert.match(rules, /requesterIsHouseholdAdmin\(householdId\)/);
  assert.match(rules, /request\.auth\.uid == memberIds\[1\]/);
});
