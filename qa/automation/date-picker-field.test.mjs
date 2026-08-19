import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(resolve(repositoryRoot, path), 'utf8');

test('expense and fridge forms use the shared calendar date picker', () => {
  const expenses = read('src/app/expenses.tsx');
  const fridge = read('src/app/fridge.tsx');

  assert.match(
    expenses,
    /<DatePickerField[\s\S]*?label="날짜"[\s\S]*?testID="expense-due-date-input"/,
  );
  assert.match(
    fridge,
    /<DatePickerField[\s\S]*?label="유통기한"[\s\S]*?allowClear[\s\S]*?testID="fridge-expiry-date-input"/,
  );
  assert.doesNotMatch(expenses, /placeholder="YYYY-MM-DD"/);
  assert.doesNotMatch(fridge, /placeholder="YYYY-MM-DD"/);
});

test('date picker provides month navigation, date selection, and optional clearing', () => {
  const picker = read('src/components/app/date-picker-field.tsx');

  assert.match(picker, /setVisibleMonth\(\(current\) => addMonths\(current, -1\)\)/);
  assert.match(picker, /setVisibleMonth\(\(current\) => addMonths\(current, 1\)\)/);
  assert.match(picker, /onChange\(toIsoDate\(date\)\)/);
  assert.match(picker, /accessibilityState=\{\{ selected \}\}/);
  assert.match(picker, /allowClear && value/);
  assert.match(picker, /onChange\(''\)/);
});
