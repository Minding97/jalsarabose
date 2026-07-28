import { Chore, Expense, FridgeItem, HouseholdSnapshot, ISODate } from '@/domain/types';
import { daysUntil, fromIsoDate, todayIso } from '@/utils/dates';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type ReminderType = 'expense' | 'chore' | 'fridge';

export type ReminderCandidate = {
  id: string;
  type: ReminderType;
  title: string;
  body: string;
  date: Date;
  data: Record<string, string>;
};

export function getReminderCandidates(
  snapshot: HouseholdSnapshot,
  baseDate: ISODate = todayIso(),
  now = new Date(),
) {
  const expenses = snapshot.expenses
    .filter((expense) => expense.notificationEnabled && expense.status !== 'paid')
    .map((expense) => expenseReminder(expense))
    .filter((candidate): candidate is ReminderCandidate => Boolean(candidate));
  const chores = snapshot.chores
    .filter((chore) => chore.notificationEnabled && chore.status === 'scheduled')
    .map((chore) => choreReminder(chore))
    .filter((candidate): candidate is ReminderCandidate => Boolean(candidate));
  const fridgeItems = snapshot.fridgeItems
    .filter((item) => {
      if (!item.notificationEnabled || !item.expiryDate || item.status !== 'stocked') {
        return false;
      }

      const diff = daysUntil(item.expiryDate, baseDate);
      return diff >= 0 && diff <= 3;
    })
    .map((item) => fridgeReminder(item))
    .filter((candidate): candidate is ReminderCandidate => Boolean(candidate));

  return [...expenses, ...chores, ...fridgeItems]
    .filter((candidate) => candidate.date.getTime() > now.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function expenseReminder(expense: Expense): ReminderCandidate | null {
  return {
    id: `expense-${expense.id}`,
    type: 'expense',
    title: '공동 지출 납부일',
    body: `${expense.title} ${expense.amount.toLocaleString()}원 납부일이에요.`,
    date: notificationTimeOn(expense.dueDate, 9),
    data: { type: 'expense', id: expense.id },
  };
}

function choreReminder(chore: Chore): ReminderCandidate | null {
  return {
    id: `chore-${chore.id}`,
    type: 'chore',
    title: '오늘의 집안일',
    body: `${chore.title} 할 차례예요. 완료하면 점수에 반영돼요.`,
    date: notificationTimeOn(chore.dueDate, 9),
    data: { type: 'chore', id: chore.id },
  };
}

function fridgeReminder(item: FridgeItem): ReminderCandidate | null {
  if (!item.expiryDate) {
    return null;
  }

  const reminderDate = new Date(fromIsoDate(item.expiryDate).getTime() - 3 * ONE_DAY_MS);
  reminderDate.setHours(9, 0, 0, 0);

  return {
    id: `fridge-${item.id}`,
    type: 'fridge',
    title: '유통기한 임박',
    body: `${item.name} 유통기한이 3일 이내로 다가왔어요.`,
    date: reminderDate,
    data: { type: 'fridge', id: item.id },
  };
}

function notificationTimeOn(date: string, hour: number) {
  const notificationDate = fromIsoDate(date);
  notificationDate.setHours(hour, 0, 0, 0);
  return notificationDate;
}
