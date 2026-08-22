import { isSameMonth } from 'date-fns';

import { expenseStatusLabels, fridgeStatusLabels } from '@/domain/labels';
import {
  EventType,
  Expense,
  FridgeItem,
  HouseholdEvent,
  HouseholdMember,
  HouseholdSnapshot,
  ISODate,
} from '@/domain/types';
import { daysUntil, formatKoreanDate, fromIsoDate } from '@/utils/dates';

export function getMemberName(members: HouseholdMember[], memberId?: string): string {
  const memberIndex = members.findIndex((member) => member.id === memberId);
  return memberIndex >= 0 ? getMemberDisplayName(members[memberIndex], memberIndex) : '미지정';
}

export function getMemberDisplayName(member: HouseholdMember, index: number): string {
  const name = member.name.trim();
  return !name || name.includes('@') ? `가구원 ${index + 1}` : name;
}

export function getCalendarEvents(snapshot: HouseholdSnapshot): HouseholdEvent[] {
  const expenseEvents = snapshot.expenses.map((expense) => expenseToEvent(expense));
  const fridgeEvents = snapshot.fridgeItems
    .filter((item) => item.expiryDate && item.status === 'stocked')
    .map((item) => fridgeToEvent(item));

  return [...expenseEvents, ...fridgeEvents].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

export function getHomeSummary(snapshot: HouseholdSnapshot, today: ISODate) {
  const allEvents = getCalendarEvents(snapshot);
  const todayEvents = allEvents.filter((event) => event.date === today);
  const expiringFridgeItems = snapshot.fridgeItems.filter((item) => {
    if (!item.expiryDate || item.status !== 'stocked') {
      return false;
    }
    const diff = daysUntil(item.expiryDate, today);
    return diff >= 0 && diff <= 3;
  });

  return {
    todayEvents,
    expiringFridgeItems,
    monthlyExpenseTotal: getExpenseSummary(snapshot, today).total,
  };
}

export function getExpenseSummary(snapshot: HouseholdSnapshot, today: ISODate) {
  const currentMonth = fromIsoDate(today);
  const monthlyExpenses = snapshot.expenses.filter((expense) =>
    isSameMonth(fromIsoDate(expense.dueDate), currentMonth),
  );
  const total = monthlyExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const byCategory = Object.values(
    monthlyExpenses.reduce<
      Record<string, { category: Expense['category']; amount: number; count: number }>
    >((acc, expense) => {
      acc[expense.category] ??= { category: expense.category, amount: 0, count: 0 };
      acc[expense.category].amount += expense.amount;
      acc[expense.category].count += 1;
      return acc;
    }, {}),
  ).sort((a, b) => b.amount - a.amount);

  return {
    total,
    byCategory,
    scheduledCount: monthlyExpenses.filter((expense) => expense.status === 'scheduled').length,
    paidCount: monthlyExpenses.filter((expense) => expense.status === 'paid').length,
    overdueCount: monthlyExpenses.filter((expense) => expense.status === 'overdue').length,
  };
}

export function getFridgeSummary(snapshot: HouseholdSnapshot, today: ISODate) {
  const stockedItems = snapshot.fridgeItems.filter((item) => item.status === 'stocked');
  const expiringItems = stockedItems.filter((item) => {
    if (!item.expiryDate) {
      return false;
    }
    const diff = daysUntil(item.expiryDate, today);
    return diff >= 0 && diff <= 3;
  });
  const expiredItems = stockedItems.filter(
    (item) => item.expiryDate && daysUntil(item.expiryDate, today) < 0,
  );
  const byStorage = Object.values(
    stockedItems.reduce<
      Record<string, { storageType: FridgeItem['storageType']; count: number; expiringCount: number }>
    >((acc, item) => {
      acc[item.storageType] ??= { storageType: item.storageType, count: 0, expiringCount: 0 };
      acc[item.storageType].count += 1;
      if (item.expiryDate) {
        const diff = daysUntil(item.expiryDate, today);
        if (diff >= 0 && diff <= 3) {
          acc[item.storageType].expiringCount += 1;
        }
      }
      return acc;
    }, {}),
  );
  const recentItems = snapshot.fridgeItems
    .filter((item) => {
      const diff = daysUntil(item.createdAt, today);
      return diff >= -3 && diff <= 0;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const processedItems = snapshot.fridgeItems
    .filter((item) => item.status === 'used' || item.status === 'discarded')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    stockCount: stockedItems.length,
    expiringCount: expiringItems.length,
    expiredCount: expiredItems.length,
    recentCount: recentItems.length,
    processedCount: processedItems.length,
    byStorage,
    recentItems,
    processedItems,
  };
}

function expenseToEvent(expense: Expense): HouseholdEvent {
  return {
    id: `expense-${expense.id}`,
    type: 'expense' satisfies EventType,
    typeLabel: '지출',
    title: expense.title,
    subtitle: `${formatKoreanDate(expense.dueDate)} · ${expense.amount.toLocaleString()}원 · ${
      expenseStatusLabels[expense.status]
    }`,
    date: expense.dueDate,
    status: expense.status,
    tone: expense.status === 'overdue' ? 'danger' : 'info',
  };
}

function fridgeToEvent(item: FridgeItem): HouseholdEvent {
  return {
    id: `fridge-${item.id}`,
    type: 'fridge' satisfies EventType,
    typeLabel: '냉장고',
    title: `${item.name} 유통기한`,
    subtitle: `${formatKoreanDate(item.expiryDate ?? item.createdAt)} · ${
      fridgeStatusLabels[item.status]
    }`,
    date: item.expiryDate ?? item.createdAt,
    status: item.status,
    tone: 'accent',
  };
}
