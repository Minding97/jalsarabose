import assert from 'node:assert/strict';
import test from 'node:test';

import type { ExpenseInput } from '@/domain/types';
import { validateExpenseInput } from '@/utils/validation';

function expenseInput(splitRatio: Record<string, number>): ExpenseInput {
  return {
    title: 'test',
    category: 'living',
    amount: 1000,
    dueDate: '2026-08-04',
    payerId: 'a',
    splitRatio,
    isRecurring: false,
    status: 'paid',
    notificationEnabled: true,
  };
}

test('accepts split ratios that sum to 100 within the rounding tolerance', () => {
  assert.equal(validateExpenseInput(expenseInput({ a: 33.33, b: 66.68 })), null);
});

test('rejects split ratios outside the sum tolerance', () => {
  assert.equal(
    validateExpenseInput(expenseInput({ a: 40, b: 50 })),
    '분담 비율 합계는 100%여야 해요.',
  );
});

test('rejects negative split ratios', () => {
  assert.equal(
    validateExpenseInput(expenseInput({ a: 110, b: -10 })),
    '분담 비율은 0 이상의 숫자로 입력해주세요.',
  );
});

test('rejects non-finite split ratios', () => {
  assert.equal(
    validateExpenseInput(expenseInput({ a: Number.NaN, b: 100 })),
    '분담 비율은 0 이상의 숫자로 입력해주세요.',
  );
});
