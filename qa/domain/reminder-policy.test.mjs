import assert from 'node:assert/strict';
import test from 'node:test';

import { getReminderCandidates } from '../../src/utils/reminder-policy.ts';

function expense(id, dueDate, status = 'scheduled', notificationEnabled = true) {
  return {
    id,
    title: id,
    amount: 10_000,
    dueDate,
    status,
    notificationEnabled,
  };
}

function fridgeItem(id, expiryDate, overrides = {}) {
  return {
    id,
    name: id,
    expiryDate,
    status: 'stocked',
    notificationEnabled: true,
    ...overrides,
  };
}

test('schedules unpaid and overdue expenses only while their 9 AM trigger is future', () => {
  const candidates = getReminderCandidates(
    {
      expenses: [
        expense('past-overdue', '2024-02-26', 'overdue'),
        expense('today-overdue', '2024-02-27', 'overdue'),
        expense('tomorrow', '2024-02-28'),
        expense('paid', '2024-02-28', 'paid'),
        expense('disabled', '2024-02-28', 'scheduled', false),
      ],
      fridgeItems: [],
    },
    '2024-02-27',
    new Date(2024, 1, 27, 8, 0, 0),
  );

  assert.deepEqual(candidates.map((candidate) => candidate.id), [
    'expense-today-overdue',
    'expense-tomorrow',
  ]);
  assert.equal(candidates[0].date.getHours(), 9);
});

test('calculates the three-day fridge reminder across leap day and excludes past D-day triggers', () => {
  const candidates = getReminderCandidates(
    {
      expenses: [],
      fridgeItems: [
        fridgeItem('leap-boundary', '2024-03-01'),
        fridgeItem('d-day', '2024-02-27'),
        fridgeItem('d-4', '2024-03-02'),
        fridgeItem('used', '2024-03-01', { status: 'used' }),
      ],
    },
    '2024-02-27',
    new Date(2024, 1, 27, 8, 0, 0),
  );

  assert.deepEqual(candidates.map((candidate) => candidate.id), ['fridge-leap-boundary']);
  assert.equal(candidates[0].date.getFullYear(), 2024);
  assert.equal(candidates[0].date.getMonth(), 1);
  assert.equal(candidates[0].date.getDate(), 27);
  assert.equal(candidates[0].date.getHours(), 9);
});
