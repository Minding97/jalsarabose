import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

test('recurring expense rules preserve deterministic and linked records', () => {
  const templates = rules.match(
    /match \/recurringExpenseTemplates\/\{templateId\} \{([\s\S]*?)\n      \}/,
  )?.[1];
  const scheduled = rules.match(
    /match \/scheduledExpenses\/\{scheduledExpenseId\} \{([\s\S]*?)\n      \}/,
  )?.[1];

  assert.ok(templates, 'recurringExpenseTemplates rule block is missing');
  assert.ok(scheduled, 'scheduledExpenses rule block is missing');
  assert.match(templates, /validRecurringExpenseTemplate\(householdId\)/);
  assert.match(scheduled, /scheduledExpenseId == request\.resource\.data\.templateId \+ '__' \+ request\.resource\.data\.month/);
  assert.match(scheduled, /scheduledExpenseSnapshotStaysSame\(\)/);
  assert.match(scheduled, /processesScheduledExpense\(householdId\)/);
  assert.match(rules, /existsAfter\([\s\S]*?expenses\/\$\(request\.resource\.data\.expenseId\)/);
  assert.match(rules, /validLinkedScheduledExpense\(householdId, expenseId\)/);
  assert.match(rules, /scheduled\.data\.expenseId == expenseId/);
  assert.match(rules, /request\.resource\.data\.amount == scheduled\.data\.amount/);
  assert.match(rules, /!\('scheduledExpenseId' in resource\.data\)/);
});
