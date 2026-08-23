import type {
  Expense,
  FridgeItem,
  HouseholdSnapshot,
  NotificationSettings,
  ReminderLeadDays,
} from '../domain/types';

const NOTIFICATION_HOUR = 9;

export const REMINDER_LEAD_DAYS: readonly ReminderLeadDays[] = [3, 1, 0];
export const HOUSEHOLD_REMINDER_PREFIX = 'household-reminder-';

export type ReminderType = 'expense' | 'fridge';

export type ReminderRecipient = {
  memberId: string;
  settings: NotificationSettings;
};

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
  recipient: ReminderRecipient,
  now = new Date(),
): ReminderCandidate[] {
  const expenses = recipient.settings.expenseEnabled
    ? snapshot.expenses
        .filter(
          (expense) =>
            expense.notificationEnabled &&
            expense.status !== 'paid' &&
            expense.payerId === recipient.memberId,
        )
        .flatMap((expense) => expenseReminders(expense, recipient.memberId))
    : [];
  const fridgeItems = recipient.settings.fridgeEnabled
    ? snapshot.fridgeItems
        .filter(
          (item) => item.notificationEnabled && Boolean(item.expiryDate) && item.status === 'stocked',
        )
        .flatMap((item) => fridgeReminders(item, recipient.memberId))
    : [];

  const uniqueCandidates = new Map<string, ReminderCandidate>();
  for (const candidate of [...expenses, ...fridgeItems]) {
    if (candidate.date.getTime() > now.getTime()) {
      uniqueCandidates.set(candidate.id, candidate);
    }
  }

  return [...uniqueCandidates.values()].sort(
    (left, right) => left.date.getTime() - right.date.getTime() || left.id.localeCompare(right.id),
  );
}

function expenseReminders(expense: Expense, recipientId: string): ReminderCandidate[] {
  return REMINDER_LEAD_DAYS.map((leadDays) => ({
    id: reminderId(recipientId, 'expense', expense.id, leadDays),
    type: 'expense',
    title: leadDays === 0 ? '공동 지출 납부일' : '공동 지출 납부 예정',
    body:
      leadDays === 0
        ? `${expense.title} ${expense.amount.toLocaleString()}원 납부일이에요.`
        : `${expense.title} ${expense.amount.toLocaleString()}원 납부까지 ${leadDays}일 남았어요.`,
    date: reminderTime(expense.dueDate, leadDays),
    data: {
      type: 'expense',
      id: expense.id,
      recipientId,
      leadDays: String(leadDays),
    },
  }));
}

function fridgeReminders(item: FridgeItem, recipientId: string): ReminderCandidate[] {
  if (!item.expiryDate) {
    return [];
  }
  const expiryDate = item.expiryDate;

  return REMINDER_LEAD_DAYS.map((leadDays) => ({
    id: reminderId(recipientId, 'fridge', item.id, leadDays),
    type: 'fridge',
    title: leadDays === 0 ? '유통기한 당일' : '유통기한 임박',
    body:
      leadDays === 0
        ? `${item.name} 유통기한이 오늘이에요.`
        : `${item.name} 유통기한이 ${leadDays}일 남았어요.`,
    date: reminderTime(expiryDate, leadDays),
    data: {
      type: 'fridge',
      id: item.id,
      recipientId,
      leadDays: String(leadDays),
    },
  }));
}

function reminderId(
  recipientId: string,
  type: ReminderType,
  itemId: string,
  leadDays: ReminderLeadDays,
) {
  return `${HOUSEHOLD_REMINDER_PREFIX}${recipientId}-${type}-${itemId}-${leadDays}`;
}

function reminderTime(date: string, leadDays: ReminderLeadDays) {
  const notificationDate = new Date(`${date}T00:00:00`);
  notificationDate.setDate(notificationDate.getDate() - leadDays);
  notificationDate.setHours(NOTIFICATION_HOUR, 0, 0, 0);
  return notificationDate;
}
