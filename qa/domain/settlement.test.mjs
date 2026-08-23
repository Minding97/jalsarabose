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

test('settles each expense using its custom member split', () => {
  const expenses = [
    {
      dueDate: '2026-08-10',
      amount: 100_000,
      payerId: 'member-a',
      splitRatio: { 'member-a': 70, 'member-b': 30 },
    },
  ];

  assert.deepEqual(getExpenseOverview(expenses, '2026-08', ['member-a', 'member-b']).settlement, {
    from: 'member-b',
    to: 'member-a',
    amount: 30_000,
  });
});

test('normalizes legacy split weights and falls back to equal shares when none are usable', () => {
  assert.deepEqual(
    getExpenseOverview(
      [
        {
          dueDate: '2026-08-10',
          amount: 90_000,
          payerId: 'member-b',
          splitRatio: { 'member-a': 60_000, 'member-b': 30_000 },
        },
      ],
      '2026-08',
      ['member-a', 'member-b'],
    ).settlement,
    { from: 'member-a', to: 'member-b', amount: 60_000 },
  );

  assert.deepEqual(
    getExpenseOverview(
      [
        {
          dueDate: '2026-08-10',
          amount: 100,
          payerId: 'member-a',
          splitRatio: { 'member-a': -1, 'member-b': 0 },
        },
      ],
      '2026-08',
      ['member-a', 'member-b'],
    ).settlement,
    { from: 'member-b', to: 'member-a', amount: 50 },
  );
});
