import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isValidIsoDate,
  validateExpenseInput,
  validateFridgeItemInput,
} from '../../src/utils/validation.ts';

function expenseInput(overrides = {}) {
  return {
    title: '관리비',
    amount: 100_000,
    dueDate: '2024-02-29',
    category: 'utilities',
    status: 'scheduled',
    isRecurring: false,
    notificationEnabled: true,
    ...overrides,
  };
}

function fridgeInput(overrides = {}) {
  return {
    name: '우유',
    category: 'dairy',
    storageType: 'fridge',
    status: 'stocked',
    notificationEnabled: true,
    ...overrides,
  };
}

test('accepts a leap day and rejects impossible or non-canonical ISO dates', () => {
  assert.equal(isValidIsoDate('2024-02-29'), true);
  assert.equal(isValidIsoDate('2023-02-29'), false);
  assert.equal(isValidIsoDate('2024-04-31'), false);
  assert.equal(isValidIsoDate('2024-2-09'), false);
});

test('validates required expense fields and finite positive amounts', () => {
  assert.equal(validateExpenseInput(expenseInput()), null);
  assert.match(validateExpenseInput(expenseInput({ title: '  ' })), /지출명/);
  assert.match(validateExpenseInput(expenseInput({ amount: Number.NaN })), /금액/);
  assert.match(validateExpenseInput(expenseInput({ amount: 0 })), /금액/);
  assert.match(validateExpenseInput(expenseInput({ dueDate: '2023-02-29' })), /납부 날짜/);
});

test('requires custom expense split ratios to be finite, non-negative, and total 100%', () => {
  assert.equal(
    validateExpenseInput(expenseInput({ splitRatio: { memberA: 33.33, memberB: 66.68 } })),
    null,
  );
  assert.match(
    validateExpenseInput(expenseInput({ splitRatio: { memberA: 40, memberB: 50 } })),
    /합계는 100%/,
  );
  assert.match(
    validateExpenseInput(expenseInput({ splitRatio: { memberA: 110, memberB: -10 } })),
    /0 이상의 숫자/,
  );
  assert.match(
    validateExpenseInput(expenseInput({ splitRatio: { memberA: Number.POSITIVE_INFINITY } })),
    /0 이상의 숫자/,
  );
});

test('allows an empty fridge expiry date but rejects an impossible date', () => {
  assert.equal(validateFridgeItemInput(fridgeInput()), null);
  assert.equal(validateFridgeItemInput(fridgeInput({ expiryDate: '' })), null);
  assert.match(validateFridgeItemInput(fridgeInput({ expiryDate: '2023-02-29' })), /유통기한/);
});
