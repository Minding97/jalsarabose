import type {
  HouseholdNote,
  HouseholdNoteComment,
  HouseholdNoteInput,
} from './types';

export const NOTE_TITLE_MAX_LENGTH = 80;
export const NOTE_MEMO_MAX_LENGTH = 500;
export const NOTE_COMMENT_MAX_LENGTH = 500;

export function validateHouseholdNoteInput(input: HouseholdNoteInput): string | null {
  const title = input.title.trim();
  const memo = input.memo?.trim() ?? '';

  if (!title) {
    return input.type === 'shopping' ? '살 것의 항목명을 입력해주세요.' : '메모 제목을 입력해주세요.';
  }
  if (title.length > NOTE_TITLE_MAX_LENGTH) {
    return `제목은 ${NOTE_TITLE_MAX_LENGTH}자 이하로 입력해주세요.`;
  }
  if (memo.length > NOTE_MEMO_MAX_LENGTH) {
    return `간단 메모는 ${NOTE_MEMO_MAX_LENGTH}자 이하로 입력해주세요.`;
  }
  return null;
}

export function validateNoteComment(content: string): string | null {
  const normalized = content.trim();
  if (!normalized) return '댓글을 입력해주세요.';
  if (normalized.length > NOTE_COMMENT_MAX_LENGTH) {
    return `댓글은 ${NOTE_COMMENT_MAX_LENGTH}자 이하로 입력해주세요.`;
  }
  return null;
}

export function getCommentsForNote(
  noteId: string,
  comments: HouseholdNoteComment[],
): HouseholdNoteComment[] {
  return comments
    .filter((comment) => comment.noteId === noteId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function getCommentPreview(
  noteId: string,
  comments: HouseholdNoteComment[],
  limit = 2,
): HouseholdNoteComment[] {
  return getCommentsForNote(noteId, comments).slice(-limit);
}

export function sortHouseholdNotes(notes: HouseholdNote[]): HouseholdNote[] {
  return [...notes].sort(
    (left, right) =>
      Number(left.status === 'completed') - Number(right.status === 'completed') ||
      right.updatedAt.localeCompare(left.updatedAt) ||
      right.id.localeCompare(left.id),
  );
}
