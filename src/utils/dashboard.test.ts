import assert from 'node:assert/strict';
import test from 'node:test';

import type { Expense, HouseholdMember, HouseholdSnapshot } from '@/domain/types';
import { getExpenseSettlement } from '@/utils/dashboard';

const members: HouseholdMember[] = ['a', 'b', 'c'].map((id) => ({
  id,
  householdId: 'home',
  userId: id,
  name: id.toUpperCase(),
  role: id === 'a' ? 'admin' : 'member',
  joinedAt: '2026-08-01',
}));

function expense(overrides: Partial<Expense>): Expense {
  return {
    id: 'expense',
    householdId: 'home',
    title: 'test',
    category: 'living',
    amount: 300,
    dueDate: '2026-08-04',
    payerId: 'a',
    isRecurring: false,
    status: 'paid',
    createdBy: 'a',
    createdAt: '2026-08-04',
    notificationEnabled: true,
    ...overrides,
  };
}

function snapshot(expenses: Expense[], householdMembers = members): HouseholdSnapshot {
  return {
    household: {
      id: 'home',
      name: 'Home',
      inviteCode: 'ABC123',
      createdBy: 'a',
      createdAt: '2026-08-01',
    },
    members: householdMembers,
    expenses,
    chores: [],
    fridgeItems: [],
  };
}

test('settles an equal split across more than two members', () => {
  const result = getExpenseSettlement(snapshot([expense({})]), '2026-08-04');

  assert.deepEqual(result.balances, { a: 200, b: -100, c: -100 });
  assert.deepEqual(result.transfers, [
    { from: 'b', to: 'a', amount: 100 },
    { from: 'c', to: 'a', amount: 100 },
  ]);
});

test('normalizes custom ratios before calculating transfers', () => {
  const result = getExpenseSettlement(
    snapshot([
      expense({ amount: 1000, payerId: 'b', splitRatio: { a: 60000, b: 30000, c: 10000 } }),
    ]),
    '2026-08-04',
  );

  assert.deepEqual(result.balances, { a: -600, b: 700, c: -100 });
  assert.deepEqual(result.transfers, [
    { from: 'a', to: 'b', amount: 600 },
    { from: 'c', to: 'b', amount: 100 },
  ]);
});

test('rounds transfers without creating sub-won transfers', () => {
  const result = getExpenseSettlement(snapshot([expense({ amount: 100 })]), '2026-08-04');

  assert.deepEqual(result.transfers, [
    { from: 'b', to: 'a', amount: 33 },
    { from: 'c', to: 'a', amount: 33 },
  ]);
});

test('keeps zero-share members out of transfers', () => {
  const result = getExpenseSettlement(
    snapshot([expense({ amount: 100, splitRatio: { a: 50, b: 50, c: 0 } })]),
    '2026-08-04',
  );

  assert.deepEqual(result.transfers, [{ from: 'b', to: 'a', amount: 50 }]);
});

test('ignores departed payers and falls back to equal split for departed ratios', () => {
  const departedPayer = expense({ payerId: 'departed' });
  const departedRatio = expense({ id: 'departed-ratio', splitRatio: { departed: 100 } });
  const result = getExpenseSettlement(snapshot([departedPayer, departedRatio]), '2026-08-04');

  assert.deepEqual(result.balances, { a: 200, b: -100, c: -100 });
  assert.deepEqual(result.transfers, [
    { from: 'b', to: 'a', amount: 100 },
    { from: 'c', to: 'a', amount: 100 },
  ]);
});
