import assert from 'node:assert/strict';
import test from 'node:test';

import { ChoreInput } from '@/domain/types';
import { validateChoreInput } from '@/utils/validation';

const validInput: ChoreInput = {
  title: '청소',
  assigneeId: 'member-a',
  dueDate: '2026-08-04',
  repeatCycle: 'weekly',
  score: 3,
  status: 'scheduled',
  notificationEnabled: true,
};

test('rejects empty, zero, and non-numeric chore scores', () => {
  assert.equal(validateChoreInput({ ...validInput, score: Number('') }), '점수는 0보다 큰 숫자로 입력해주세요.');
  assert.equal(validateChoreInput({ ...validInput, score: 0 }), '점수는 0보다 큰 숫자로 입력해주세요.');
  assert.equal(
    validateChoreInput({ ...validInput, score: Number('not-a-number') }),
    '점수는 0보다 큰 숫자로 입력해주세요.',
  );
  assert.equal(validateChoreInput(validInput), null);
});
