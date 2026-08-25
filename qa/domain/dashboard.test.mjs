import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getCalendarEvents,
  getExpenseSummary,
  getFridgeSummary,
  getHomeSummary,
} from '../../src/utils/dashboard.ts';

function expense(id, dueDate, amount, status = 'scheduled', overrides = {}) {
  return {
    id,
    title: id,
    category: 'living',
    amount,
    dueDate,
    status,
    isRecurring: false,
    notificationEnabled: true,
    ...overrides,
  };
}

function fridgeItem(id, expiryDate, overrides = {}) {
  return {
    id,
    name: id,
    storageType: 'fridge',
    expiryDate,
    status: 'stocked',
    createdAt: '2024-02-27',
    notificationEnabled: true,
    ...overrides,
  };
}

function snapshot({ expenses = [], fridgeItems = [] } = {}) {
  return {
    members: [],
    monthlyBudgets: [],
    expenses,
    fridgeItems,
  };
}

test('limits the expense dashboard to the selected leap-year month and counts overdue items', () => {
  const result = getExpenseSummary(
    snapshot({
      expenses: [
        expense('previous-month', '2024-01-31', 1_000),
        expense('first-day', '2024-02-01', 2_000, 'paid', { category: 'utilities' }),
        expense('leap-day', '2024-02-29', 3_000, 'overdue'),
        expense('next-month', '2024-03-01', 4_000),
      ],
    }),
    '2024-02-29',
  );

  assert.equal(result.total, 5_000);
  assert.equal(result.paidCount, 1);
  assert.equal(result.overdueCount, 1);
  assert.equal(result.scheduledCount, 0);
  assert.deepEqual(result.byCategory, [
    { category: 'living', amount: 3_000, count: 1 },
    { category: 'utilities', amount: 2_000, count: 1 },
  ]);
});

test('keeps persisted recurring expenses on their due date across a month boundary', () => {
  const events = getCalendarEvents(
    snapshot({
      expenses: [
        expense('march-once', '2024-03-01', 10_000),
        expense('leap-recurring', '2024-02-29', 20_000, 'overdue', { isRecurring: true }),
      ],
    }),
  );

  assert.deepEqual(events.map(({ id, date }) => ({ id, date })), [
    { id: 'expense-leap-recurring', date: '2024-02-29' },
    { id: 'expense-march-once', date: '2024-03-01' },
  ]);
  assert.equal(events[0].tone, 'danger');
});

test('applies D-day and three-day expiry boundaries to home and fridge summaries', () => {
  const data = snapshot({
    expenses: [expense('today-expense', '2024-02-27', 7_000)],
    fridgeItems: [
      fridgeItem('expired', '2024-02-26'),
      fridgeItem('d-day', '2024-02-27'),
      fridgeItem('leap-day', '2024-02-29'),
      fridgeItem('d-3', '2024-03-01'),
      fridgeItem('d-4', '2024-03-02'),
      fridgeItem('used-d-day', '2024-02-27', { status: 'used' }),
    ],
  });

  const home = getHomeSummary(data, '2024-02-27');
  assert.deepEqual(home.todayEvents.map((event) => event.id), [
    'expense-today-expense',
    'fridge-d-day',
  ]);
  assert.deepEqual(home.expiringFridgeItems.map((item) => item.id), [
    'd-day',
    'leap-day',
    'd-3',
  ]);
  assert.equal(home.monthlyExpenseTotal, 7_000);

  const fridge = getFridgeSummary(data, '2024-02-27');
  assert.equal(fridge.stockCount, 5);
  assert.equal(fridge.expiringCount, 3);
  assert.equal(fridge.expiredCount, 1);
  assert.deepEqual(fridge.byStorage, [
    { storageType: 'fridge', count: 5, expiringCount: 3 },
  ]);
});
