import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(resolve(repositoryRoot, path), 'utf8');

const screens = {
  calendar: read('src/app/calendar.tsx'),
  expense: read('src/app/expenses.tsx'),
  fridge: read('src/app/fridge.tsx'),
};

test('calendar, expense, and fridge items enter selection mode on long press', () => {
  for (const [name, source] of Object.entries(screens)) {
    assert.match(source, /onLongPress=\{\(\) => \{/i, `${name} must handle long presses`);
    assert.match(source, /selection\.select\(/, `${name} must add the held item to selection`);
    assert.match(
      source,
      /accessibilityState=\{\{ selected: selection\.isSelected\(/,
      `${name} must expose selected state to assistive technology`,
    );
    assert.match(source, /<MultiSelectToolbar/, `${name} must show bulk actions`);
  }
});

test('bulk toolbars expose delete and edit actions with deterministic selectors', () => {
  const toolbar = read('src/components/app/multi-select-toolbar.tsx');

  assert.match(toolbar, /-bulk-delete-button/);
  assert.match(toolbar, /-bulk-edit-button/);
  assert.match(toolbar, />\s*삭제\s*</);
  assert.match(toolbar, />\s*일괄 수정\s*</);
});

test('each tab applies bulk edits to fields appropriate for its data', () => {
  assert.match(screens.calendar, /updateExpenseItem\(entityId, \{ dueDate: nextDate \}\)/);
  assert.match(screens.calendar, /updateFridgeItemEntry\(entityId, \{ expiryDate: nextDate \}\)/);
  assert.match(screens.expense, /bulkCategory[\s\S]*bulkStatus[\s\S]*dueDate/);
  assert.match(screens.fridge, /bulkCategory[\s\S]*bulkStorageType[\s\S]*bulkStatus/);
  assert.match(screens.expense, /Promise\.all\([\s\S]*deleteExpenseItem/);
  assert.match(screens.fridge, /Promise\.all\([\s\S]*deleteFridgeItemEntry/);
});
