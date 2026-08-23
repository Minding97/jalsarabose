import assert from 'node:assert/strict';
import test from 'node:test';

import { daysUntil } from '../../src/utils/dates.ts';

test('calculates D-day offsets across leap and ordinary February boundaries', () => {
  assert.equal(daysUntil('2024-02-29', '2024-02-28'), 1);
  assert.equal(daysUntil('2024-03-01', '2024-02-28'), 2);
  assert.equal(daysUntil('2025-03-01', '2025-02-28'), 1);
  assert.equal(daysUntil('2024-02-29', '2024-02-29'), 0);
  assert.equal(daysUntil('2024-02-28', '2024-02-29'), -1);
});
