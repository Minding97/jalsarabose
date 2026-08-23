import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getCommentPreview,
  getCommentsForNote,
  sortHouseholdNotes,
  validateHouseholdNoteInput,
  validateNoteComment,
} from '../../src/domain/household-notes.ts';

test('shopping items require only an item name and optional simple memo', () => {
  assert.match(validateHouseholdNoteInput({ type: 'shopping', title: '  ', memo: '' }), /항목명/);
  assert.equal(
    validateHouseholdNoteInput({ type: 'shopping', title: '세탁세제', memo: '무향 제품' }),
    null,
  );
  assert.match(validateNoteComment(' '.repeat(2)), /댓글/);
});

test('list previews show the latest two comments in chronological order and the detail shows all', () => {
  const comments = [
    { id: 'c3', noteId: 'note-a', createdAt: '2026-08-23T03:00:00.000Z' },
    { id: 'other', noteId: 'note-b', createdAt: '2026-08-23T04:00:00.000Z' },
    { id: 'c1', noteId: 'note-a', createdAt: '2026-08-23T01:00:00.000Z' },
    { id: 'c2', noteId: 'note-a', createdAt: '2026-08-23T02:00:00.000Z' },
  ];

  assert.deepEqual(getCommentsForNote('note-a', comments).map(({ id }) => id), ['c1', 'c2', 'c3']);
  assert.deepEqual(getCommentPreview('note-a', comments).map(({ id }) => id), ['c2', 'c3']);
});

test('active notes stay above completed shopping items while each group remains recent-first', () => {
  const notes = [
    { id: 'done', status: 'completed', updatedAt: '2026-08-23T04:00:00.000Z' },
    { id: 'older', status: 'active', updatedAt: '2026-08-23T01:00:00.000Z' },
    { id: 'newer', status: 'active', updatedAt: '2026-08-23T03:00:00.000Z' },
  ];
  assert.deepEqual(sortHouseholdNotes(notes).map(({ id }) => id), ['newer', 'older', 'done']);
});
