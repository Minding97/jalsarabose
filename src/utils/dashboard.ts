import { addDays, isSameMonth, isWithinInterval } from 'date-fns';

import { choreStatusLabels, expenseStatusLabels, fridgeStatusLabels } from '@/domain/labels';
import {
  Chore,
  EventType,
  Expense,
  FridgeItem,
  HouseholdEvent,
  HouseholdMember,
  HouseholdSnapshot,
  ISODate,
} from '@/domain/types';
import { daysUntil, formatKoreanDate, fromIsoDate } from '@/utils/dates';
import { getReminderCandidates } from '@/utils/reminder-policy';

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
  const choreEvents = snapshot.chores.map((chore) => choreToEvent(chore, snapshot.members));
  const fridgeEvents = snapshot.fridgeItems
    .filter((item) => item.expiryDate && item.status === 'stocked')
    .map((item) => fridgeToEvent(item));

  return [...expenseEvents, ...choreEvents, ...fridgeEvents].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

export function getHomeSummary(snapshot: HouseholdSnapshot, today: ISODate) {
  const allEvents = getCalendarEvents(snapshot);
  const upcomingEvents = allEvents.filter((event) => {
    const diff = daysUntil(event.date, today);
    return diff >= 0 && diff <= 7;
  });
  const todayEvents = allEvents.filter((event) => event.date === today);
  const todayChores = snapshot.chores.filter(
    (chore) => chore.dueDate === today && chore.status === 'scheduled',
  );
  const upcomingExpenses = snapshot.expenses.filter((expense) => {
    const diff = daysUntil(expense.dueDate, today);
    return diff >= 0 && diff <= 7 && expense.status !== 'paid';
  });
  const expiringFridgeItems = snapshot.fridgeItems.filter((item) => {
    if (!item.expiryDate || item.status !== 'stocked') {
      return false;
    }
    const diff = daysUntil(item.expiryDate, today);
    return diff >= 0 && diff <= 3;
  });

  return {
    todayEvents,
    todayChores,
    upcomingEvents,
    upcomingExpenses,
    expiringFridgeItems,
    monthlyExpenseTotal: getExpenseSummary(snapshot, today).total,
    choreContribution: getChoreSummary(snapshot, today).contribution,
    notificationSummary: getNotificationSummary(snapshot, today),
  };
}

export function getNotificationSummary(snapshot: HouseholdSnapshot, today: ISODate) {
  const candidates = getReminderCandidates(snapshot, today);
  const expenseCount = candidates.filter((candidate) => candidate.type === 'expense').length;
  const choreCount = candidates.filter((candidate) => candidate.type === 'chore').length;
  const fridgeCount = candidates.filter((candidate) => candidate.type === 'fridge').length;

  return {
    expenseCount,
    choreCount,
    fridgeCount,
    totalCount: expenseCount + choreCount + fridgeCount,
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

export function getChoreSummary(snapshot: HouseholdSnapshot, today: ISODate) {
  const todayDate = fromIsoDate(today);
  const weekEnd = addDays(todayDate, 7);
  const currentMonthChores = snapshot.chores.filter((chore) =>
    isSameMonth(fromIsoDate(chore.dueDate), todayDate),
  );
  const contribution = getChoreContribution(snapshot.members, currentMonthChores);

  return {
    todayCount: snapshot.chores.filter(
      (chore) => chore.dueDate === today && chore.status === 'scheduled',
    ).length,
    weekCount: snapshot.chores.filter((chore) =>
      isWithinInterval(fromIsoDate(chore.dueDate), { start: todayDate, end: weekEnd }),
    ).length,
    completedScore: currentMonthChores
      .filter((chore) => chore.status === 'done')
      .reduce((sum, chore) => sum + chore.score, 0),
    pendingCount: snapshot.chores.filter((chore) => chore.status === 'scheduled').length,
    contribution,
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

  return {
    stockCount: stockedItems.length,
    expiringCount: expiringItems.length,
    expiredCount: expiredItems.length,
    recentCount: snapshot.fridgeItems.filter((item) => daysUntil(item.createdAt, today) >= -3).length,
    byStorage,
  };
}

function getChoreContribution(members: HouseholdMember[], chores: Chore[]) {
  const completedChores = chores.filter((chore) => chore.status === 'done');
  const totalScore = completedChores.reduce((sum, chore) => sum + chore.score, 0);

  return members.map((member, index) => {
    const completedScore = completedChores
      .filter((chore) => chore.assigneeId === member.id)
      .reduce((sum, chore) => sum + chore.score, 0);

    return {
      memberId: member.id,
      name: getMemberDisplayName(member, index),
      completedScore,
      ratio: totalScore === 0 ? 0 : Math.round((completedScore / totalScore) * 100),
    };
  });
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
    notificationEnabled: expense.notificationEnabled,
    tone: expense.status === 'overdue' ? 'danger' : 'info',
  };
}

function choreToEvent(chore: Chore, members: HouseholdMember[]): HouseholdEvent {
  return {
    id: `chore-${chore.id}`,
    type: 'chore' satisfies EventType,
    typeLabel: '집안일',
    title: chore.title,
    subtitle: `${getMemberName(members, chore.assigneeId)} 담당 · ${chore.score}점 · ${
      choreStatusLabels[chore.status]
    }`,
    date: chore.dueDate,
    status: chore.status,
    notificationEnabled: chore.notificationEnabled,
    tone: chore.status === 'missed' ? 'warning' : 'primary',
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
    notificationEnabled: item.notificationEnabled,
    tone: 'accent',
  };
}
