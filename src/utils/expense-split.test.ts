import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeSplitRatio } from './expense-split';

test('normalizes legacy burden amounts to percentages', () => {
  assert.deepEqual(normalizeSplitRatio({ a: 40000, b: 60000 }, ['a', 'b']), {
    a: 40,
    b: 60,
  });
});

test('keeps percentage ratios stable and sums rounded values to 100', () => {
  const ratio = normalizeSplitRatio({ a: 1, b: 1, c: 1 }, ['a', 'b', 'c']);

  assert.deepEqual(ratio, { a: 33.33, b: 33.33, c: 33.34 });
  assert.equal(Object.values(ratio ?? {}).reduce((sum, value) => sum + value, 0), 100);
});

test('drops departed members and renormalizes active member shares', () => {
  assert.deepEqual(normalizeSplitRatio({ a: 50, departed: 50 }, ['a', 'b']), {
    a: 100,
    b: 0,
  });
});
