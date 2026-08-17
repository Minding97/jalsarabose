import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(resolve(repositoryRoot, path), 'utf8');

test('tab screens hide transient subviews when focus moves to another tab', () => {
  const hook = read('src/hooks/use-return-to-tab-main.ts');

  assert.match(hook, /useFocusEffect/);
  assert.match(hook, /setSubviewVisible\(false\)/);

  for (const [screen, setter] of [
    ['src/app/index.tsx', 'setProfileOpen'],
    ['src/app/calendar.tsx', 'setAdding'],
    ['src/app/expenses.tsx', 'setFormOpen'],
    ['src/app/fridge.tsx', 'setFormOpen'],
  ]) {
    assert.match(read(screen), new RegExp(`useReturnToTabMain\\(${setter}\\)`));
  }
});

test('new expense and fridge drafts survive tab changes until explicitly discarded', () => {
  for (const screen of ['src/app/expenses.tsx', 'src/app/fridge.tsx']) {
    const source = read(screen);
    const openNewForm = source.match(/const openNewForm = \(\) => \{([\s\S]*?)\n  \};/)?.[1];

    assert.ok(openNewForm, `${screen} must define openNewForm`);
    assert.doesNotMatch(openNewForm, /resetForm\(\)/);
    assert.match(openNewForm, /if \(editingId\)/);
    assert.match(openNewForm, /setFormOpen\(true\)/);
  }
});
