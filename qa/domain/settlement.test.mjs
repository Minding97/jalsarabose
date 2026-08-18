import assert from 'node:assert/strict';
import test from 'node:test';

import { getExpenseOverview } from '../../src/domain/settlement.ts';

test('keeps settlement cumulative across expenses from different months', () => {
  const expenses = [
    { dueDate: '2026-07-31', amount: 100_000, payerId: 'member-a' },
    { dueDate: '2026-08-01', amount: 40_000, payerId: 'member-b' },
  ];
  const overview = getExpenseOverview(expenses, '2026-08', ['member-a', 'member-b']);

  assert.deepEqual(overview.monthlyExpenses, [expenses[1]]);
  assert.deepEqual(overview.settlement, {
    from: 'member-b',
    to: 'member-a',
    amount: 30_000,
  });
});
