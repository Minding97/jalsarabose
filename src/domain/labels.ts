import {
  ChoreRepeatCycle,
  ChoreStatus,
  ExpenseCategory,
  ExpenseStatus,
  FridgeCategory,
  FridgeStatus,
  StorageType,
} from '@/domain/types';

export const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  rent: '월세',
  utilities: '공과금',
  living: '생활비',
  subscription: '구독료',
  other: '기타',
};

export const expenseStatusLabels: Record<ExpenseStatus, string> = {
  scheduled: '예정',
  paid: '완료',
  overdue: '연체',
};

export const choreRepeatLabels: Record<ChoreRepeatCycle, string> = {
  none: '반복 없음',
  daily: '매일',
  weekly: '매주',
  biweekly: '격주',
  monthly: '매월',
};

export const choreStatusLabels: Record<ChoreStatus, string> = {
  scheduled: '예정',
  done: '완료',
  missed: '미완료',
};

export const fridgeCategoryLabels: Record<FridgeCategory, string> = {
  vegetable: '채소',
  fruit: '과일',
  meat: '육류',
  dairy: '유제품',
  side: '반찬',
  sauce: '소스',
  other: '기타',
};

export const storageTypeLabels: Record<StorageType, string> = {
  fridge: '냉장',
  freezer: '냉동',
  room: '실온',
};

export const fridgeStatusLabels: Record<FridgeStatus, string> = {
  stocked: '보관 중',
  used: '소진',
  discarded: '폐기',
};
