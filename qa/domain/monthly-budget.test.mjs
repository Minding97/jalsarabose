import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEqualContributions,
  getMonthlyBudgetSummary,
  shiftYearMonth,
  validateMonthlyBudgetInput,
} from '../../src/domain/monthly-budget.ts';

const members = [{ id: 'member-a' }, { id: 'member-b' }];

test('defaults two member contributions to an exact 50:50 split', () => {
  assert.deepEqual(createEqualContributions(1_000_000, members.map(({ id }) => id)), {
    'member-a': 500_000,
    'member-b': 500_000,
  });
  assert.deepEqual(createEqualContributions(101, members.map(({ id }) => id)), {
    'member-a': 51,
    'member-b': 50,
  });
});

test('rejects custom contributions whose sum differs from the monthly budget', () => {
  const message = validateMonthlyBudgetInput(
    {
      month: '2026-08',
      totalAmount: 1_000_000,
      contributionMode: 'custom',
      memberContributions: { 'member-a': 600_000, 'member-b': 300_000 },
    },
    members,
  );

  assert.match(message, /합계 900,000원.*1,000,000원.*일치/);
});

test('calculates zero and negative remaining amounts from legacy expenses in the selected month', () => {
  const budget = { month: '2026-08', totalAmount: 100_000 };
  const expenses = [
    { dueDate: '2026-07-31', amount: 999_999 },
    { dueDate: '2026-08-01', amount: 40_000 },
    { dueDate: '2026-08-31', amount: 60_000 },
    { dueDate: '2026-09-01', amount: 999_999 },
  ];

  assert.deepEqual(getMonthlyBudgetSummary(budget, expenses, '2026-08'), {
    expenseTotal: 100_000,
    budgetTotal: 100_000,
    remainingAmount: 0,
  });

  expenses.push({ dueDate: '2026-08-15', amount: 10_000 });
  assert.equal(getMonthlyBudgetSummary(budget, expenses, '2026-08').remainingAmount, -10_000);
  assert.equal(getMonthlyBudgetSummary(undefined, expenses, '2026-09').expenseTotal, 999_999);
});

test('moves across year boundaries without leaking expenses between months', () => {
  assert.equal(shiftYearMonth('2026-01', -1), '2025-12');
  assert.equal(shiftYearMonth('2026-12', 1), '2027-01');
});
