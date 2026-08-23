import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const repository = readFileSync(
  new URL('../../src/services/household-repository.ts', import.meta.url),
  'utf8',
);
const notesScreen = readFileSync(new URL('../../src/app/notes.tsx', import.meta.url), 'utf8');

test('optional note listeners cannot block core household snapshots', () => {
  assert.match(repository, /coreSources = \['household', 'members', 'monthlyBudgets', 'expenses', 'fridgeItems'\]/);
  assert.match(repository, /handleOptionalSourceError\('notes'\)/);
  assert.match(repository, /handleOptionalSourceError\('noteComments'\)/);
});

test('web destructive actions require native browser confirmation', () => {
  assert.match(notesScreen, /window\.confirm\(`\$\{title\}\\n\\n\$\{message\}`\)/);
});
