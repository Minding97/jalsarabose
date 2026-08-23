import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createHouseholdSnapshotGate } from '../../src/services/household-snapshot-gate.ts';

const notesScreen = readFileSync(new URL('../../src/app/notes.tsx', import.meta.url), 'utf8');

test('note listener failures and delays cannot block core household snapshots', () => {
  const emittedSnapshots = [];
  const surfacedErrors = [];
  const gate = createHouseholdSnapshotGate(
    () => emittedSnapshots.push('snapshot'),
    (error) => surfacedErrors.push(error),
  );

  gate.sourceFailed('notes', new Error('notes permission denied'));
  gate.sourceFailed('noteComments', new Error('comments permission denied'));
  gate.sourceLoaded('household');
  gate.sourceLoaded('members');
  gate.sourceLoaded('monthlyBudgets');
  gate.sourceLoaded('expenses');

  assert.deepEqual(emittedSnapshots, []);

  gate.sourceLoaded('fridgeItems');

  assert.deepEqual(emittedSnapshots, ['snapshot']);
  assert.deepEqual(surfacedErrors, []);

  gate.sourceLoaded('notes');

  assert.deepEqual(emittedSnapshots, ['snapshot', 'snapshot']);
});

test('web destructive actions require native browser confirmation', () => {
  assert.match(notesScreen, /window\.confirm\(`\$\{title\}\\n\\n\$\{message\}`\)/);
});
