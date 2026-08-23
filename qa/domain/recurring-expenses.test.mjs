import assert from 'node:assert/strict';
import test from 'node:test';

import {
  confirmScheduledExpenseAmount,
  createScheduledExpense,
  dueDateForMonth,
  expenseFromScheduledExpense,
  getMissingScheduledExpenses,
  getMonthlyExpenseCommitmentSummary,
} from '../../src/domain/recurring-expenses.ts';

function template(overrides = {}) {
  return {
    id: 'rent',
    householdId: 'home',
    title: '월세',
    category: 'rent',
    frequency: 'monthly',
    paymentDay: 31,
    expectedAmount: 500_000,
    startsOn: '2024-01',
    active: true,
    createdBy: 'alice',
    createdAt: '2024-01-01',
    updatedBy: 'alice',
    updatedAt: '2024-01-01',
    ...overrides,
  };
}

test('creates one immutable monthly snapshot and skips it on retries', () => {
  const first = getMissingScheduledExpenses([template()], [], '2026-08', '2026-08-01');
  assert.equal(first.length, 1);
  assert.equal(first[0].id, 'rent__2026-08');
  assert.equal(first[0].amount, 500_000);
  assert.equal(first[0].amountStatus, 'estimated');
  assert.deepEqual(getMissingScheduledExpenses([template()], first, '2026-08', '2026-08-02'), []);

  const edited = template({ title: '새 월세', expectedAmount: 600_000 });
  assert.equal(first[0].title, '월세');
  assert.equal(createScheduledExpense(edited, '2026-09', '2026-09-01').title, '새 월세');
});

test('clamps month-end payment dates including leap years', () => {
  assert.equal(dueDateForMonth('2024-02', 31), '2024-02-29');
  assert.equal(dueDateForMonth('2025-02', 31), '2025-02-28');
  assert.equal(dueDateForMonth('2026-04', 31), '2026-04-30');
  assert.equal(dueDateForMonth('2026-08', 31), '2026-08-31');
});

test('inactive and not-yet-started templates do not create new monthly items', () => {
  assert.equal(createScheduledExpense(template({ active: false }), '2026-08', '2026-08-01'), null);
  assert.equal(
    createScheduledExpense(template({ startsOn: '2026-09' }), '2026-08', '2026-08-01'),
    null,
  );
});

test('variable expenses require an amount confirmation before processing', () => {
  const variable = createScheduledExpense(
    template({ id: 'electricity', title: '전기요금', expectedAmount: null }),
    '2026-08',
    '2026-08-01',
  );
  assert.equal(variable.amountStatus, 'needs-confirmation');
  assert.throws(
    () => expenseFromScheduledExpense(variable, 'actual-electricity', 'alice', '2026-08-20'),
    /금액을 먼저 확정/,
  );

  const confirmed = confirmScheduledExpenseAmount(variable, 42_000, '2026-08-20');
  const expense = expenseFromScheduledExpense(
    confirmed,
    'actual-electricity',
    'alice',
    '2026-08-20',
  );
  assert.equal(expense.amount, 42_000);
  assert.equal(expense.scheduledExpenseId, 'electricity__2026-08');
  assert.equal(expense.recurringTemplateId, 'electricity');
});

test('processed scheduled expenses are not deducted twice from remaining money', () => {
  const scheduled = createScheduledExpense(template(), '2026-08', '2026-08-01');
  const expense = expenseFromScheduledExpense(scheduled, 'actual-rent', 'alice', '2026-08-31');
  assert.deepEqual(
    getMonthlyExpenseCommitmentSummary(
      { month: '2026-08', totalAmount: 1_000_000 },
      [expense],
      [{ ...scheduled, status: 'processed', expenseId: expense.id }],
      '2026-08',
    ),
    {
      expenseTotal: 500_000,
      scheduledTotal: 0,
      needsConfirmationCount: 0,
      budgetTotal: 1_000_000,
      remainingAmount: 500_000,
    },
  );
});
