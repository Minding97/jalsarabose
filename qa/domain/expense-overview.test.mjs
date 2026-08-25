import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getMonthlyExpenseOverview } from '../../src/domain/expense-overview.ts';

const readSource = (relativePath) =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

test('ignores legacy payer and split fields while preserving the records for reads', () => {
  const legacyExpense = {
    id: 'legacy-expense',
    dueDate: '2026-08-02',
    amount: 40_000,
    category: 'living',
    status: 'paid',
    payerId: 'member-a',
    splitRatio: { 'member-a': 90, 'member-b': 10 },
  };
  const modernExpense = {
    id: 'modern-expense',
    dueDate: '2026-08-03',
    amount: 15_000,
    category: 'living',
    status: 'scheduled',
  };

  const overview = getMonthlyExpenseOverview(
    [
      { ...legacyExpense },
      modernExpense,
      { ...modernExpense, id: 'other-month', dueDate: '2026-09-01' },
    ],
    '2026-08',
  );

  assert.deepEqual(overview.usedExpenses, [legacyExpense]);
  assert.deepEqual(overview.scheduledExpenses, [modernExpense]);
  assert.deepEqual(overview.byCategory, [{ category: 'living', amount: 40_000, count: 1 }]);
  assert.equal(overview.usedExpenses[0].payerId, 'member-a');
  assert.deepEqual(overview.usedExpenses[0].splitRatio, { 'member-a': 90, 'member-b': 10 });
  assert.equal('settlement' in overview, false);
});

test('sorts recent completed usage without mixing in planned expenses', () => {
  const expenses = [
    { id: 'older', dueDate: '2026-08-01', amount: 10, category: 'other', status: 'paid' },
    { id: 'planned', dueDate: '2026-08-03', amount: 30, category: 'other', status: 'scheduled' },
    { id: 'newer', dueDate: '2026-08-02', amount: 20, category: 'other', status: 'paid' },
    { id: 'overdue', dueDate: '2026-08-04', amount: 40, category: 'other', status: 'overdue' },
  ];

  const overview = getMonthlyExpenseOverview(expenses, '2026-08');

  assert.deepEqual(overview.recentExpenses.map(({ id }) => id), ['overdue', 'newer', 'older']);
  assert.deepEqual(overview.byCategory, [{ category: 'other', amount: 70, count: 3 }]);
});

test('keeps legacy fields read-compatible but out of the new expense input and UX', () => {
  const types = readSource('src/domain/types.ts');
  const mapper = readSource('src/services/firestore-mappers.ts');
  const screen = readSource('src/app/expenses.tsx');
  const expenseInput = types.match(/export type ExpenseInput = Pick<([\s\S]*?)>;/)?.[1];

  assert.ok(expenseInput);
  assert.doesNotMatch(expenseInput, /payerId|splitRatio/);
  assert.match(types, /payerId\?: ID;[\s\S]*splitRatio\?: Record<ID, number>;/);
  assert.match(mapper, /payerId: data\.payerId[\s\S]*splitRatio: data\.splitRatio/);
  assert.doesNotMatch(screen, /label="결제자"|label="분배 방식"|<SectionTitle>정산/);
  assert.match(screen, /label="결제수단"/);
  assert.match(screen, /label="메모 \(선택\)"/);
});
