import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeFridgeItemEnums } from '../../src/domain/fridge.ts';

test('normalizes unsupported legacy fridge enum values to labeled defaults', () => {
  assert.deepEqual(
    normalizeFridgeItemEnums({
      category: 'frozen',
      storageType: 'deep-freezer',
      status: 'expired',
    }),
    {
      category: 'other',
      storageType: 'fridge',
      status: 'stocked',
    },
  );
});

test('preserves supported fridge enum values', () => {
  assert.deepEqual(
    normalizeFridgeItemEnums({
      category: 'meat',
      storageType: 'freezer',
      status: 'used',
    }),
    {
      category: 'meat',
      storageType: 'freezer',
      status: 'used',
    },
  );
});
