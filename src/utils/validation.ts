import { isValid } from 'date-fns';

import { ChoreInput, ExpenseInput, FridgeItemInput } from '@/domain/types';
import { fromIsoDate } from '@/utils/dates';

export function isValidIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const [, year, month, day] = match;
  const parsed = fromIsoDate(value);
  return (
    isValid(parsed) &&
    parsed.getFullYear() === Number(year) &&
    parsed.getMonth() + 1 === Number(month) &&
    parsed.getDate() === Number(day)
  );
}

export function validateExpenseInput(input: ExpenseInput) {
  if (!input.title.trim()) {
    return '지출명을 입력해주세요.';
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return '금액은 0보다 큰 숫자로 입력해주세요.';
  }
  if (!isValidIsoDate(input.dueDate)) {
    return '납부 날짜는 YYYY-MM-DD 형식으로 입력해주세요.';
  }
  return null;
}

export function validateChoreInput(input: ChoreInput) {
  if (!input.title.trim()) {
    return '집안일명을 입력해주세요.';
  }
  if (!input.assigneeId) {
    return '담당자를 선택해주세요.';
  }
  if (!isValidIsoDate(input.dueDate)) {
    return '수행 날짜는 YYYY-MM-DD 형식으로 입력해주세요.';
  }
  if (!Number.isFinite(input.score) || input.score <= 0) {
    return '점수는 0보다 큰 숫자로 입력해주세요.';
  }
  return null;
}

export function validateFridgeItemInput(input: FridgeItemInput) {
  if (!input.name.trim()) {
    return '항목명을 입력해주세요.';
  }
  if (input.expiryDate && !isValidIsoDate(input.expiryDate)) {
    return '유통기한은 YYYY-MM-DD 형식 또는 빈 값으로 입력해주세요.';
  }
  return null;
}
