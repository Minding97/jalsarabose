import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(resolve(repositoryRoot, path), 'utf8');

test('form reset asks for confirmation on web and native platforms', () => {
  const confirmation = read('src/utils/form-reset.ts');
  const button = read('src/components/app/form-reset-button.tsx');

  assert.match(confirmation, /FORM_RESET_CONFIRMATION = '초기화 하시겠습니까\?'/);
  assert.match(confirmation, /Platform\.OS === 'web'[\s\S]*?globalThis\.confirm\(FORM_RESET_CONFIRMATION\)/);
  assert.match(confirmation, /Alert\.alert\('초기화', FORM_RESET_CONFIRMATION/);
  assert.match(confirmation, /text: '취소', style: 'cancel'/);
  assert.match(confirmation, /text: '초기화', style: 'destructive', onPress: onConfirm/);
  assert.match(button, /onPress=\{\(\) => confirmFormReset\(onReset\)\}/);
});

test('expense, calendar, and fridge registration forms expose reset controls', () => {
  const cases = [
    ['src/app/expenses.tsx', 'expense-reset-button', 'clearExpenseForm'],
    ['src/app/calendar.tsx', 'calendar-event-reset-button', 'clearEventForm'],
    ['src/app/fridge.tsx', 'fridge-reset-button', 'clearFridgeForm'],
  ];

  for (const [path, testID, handler] of cases) {
    const source = read(path);
    assert.match(
      source,
      new RegExp(`<FormResetButton[\\s\\S]*?testID="${testID}"[\\s\\S]*?onReset=\\{${handler}\\}`),
    );
  }
});

test('confirmed resets clear every editable text value while keeping the form open', () => {
  const expense = read('src/app/expenses.tsx');
  const fridge = read('src/app/fridge.tsx');
  const calendar = read('src/app/calendar.tsx');

  assert.match(
    expense,
    /const clearExpenseForm = \(\) => \{[\s\S]*?setTitle\(''\);[\s\S]*?setAmount\(''\);[\s\S]*?setShares\(\{\}\);[\s\S]*?\};/,
  );
  assert.match(
    fridge,
    /const clearFridgeForm = \(\) => \{[\s\S]*?setName\(''\);[\s\S]*?setQuantity\(''\);[\s\S]*?setExpiryDate\(''\);[\s\S]*?\};/,
  );
  assert.match(
    calendar,
    /const clearEventForm = \(\) => \{[\s\S]*?setNewTitle\(''\);[\s\S]*?setNewTime\(''\);[\s\S]*?\};/,
  );
  assert.doesNotMatch(expense.match(/const clearExpenseForm[\s\S]*?\n  \};/)?.[0] ?? '', /setFormOpen/);
  assert.doesNotMatch(fridge.match(/const clearFridgeForm[\s\S]*?\n  \};/)?.[0] ?? '', /setFormOpen/);
  assert.doesNotMatch(calendar.match(/const clearEventForm[\s\S]*?\n  \};/)?.[0] ?? '', /setAdding/);
});
