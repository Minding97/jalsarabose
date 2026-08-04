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
  const byPaymentMethod = Object.values(
    monthlyExpenses.reduce<Record<string, { paymentMethod: string; amount: number; count: number }>>(
      (acc, expense) => {
        const paymentMethod = expense.paymentMethod?.trim() || '미지정';
        acc[paymentMethod] ??= { paymentMethod, amount: 0, count: 0 };
        acc[paymentMethod].amount += expense.amount;
        acc[paymentMethod].count += 1;
        return acc;
      },
      {},
    ),
  ).sort((a, b) => b.amount - a.amount);
  const byStatus = (['scheduled', 'paid', 'overdue'] as const).map((status) => {
    const expenses = monthlyExpenses.filter((expense) => expense.status === status);
    return {
      status,
      amount: expenses.reduce((sum, expense) => sum + expense.amount, 0),
      count: expenses.length,
    };
  });

  return {
    total,
    byCategory,
    byPaymentMethod,
    byStatus,
    scheduledCount: byStatus.find((item) => item.status === 'scheduled')?.count ?? 0,
    paidCount: byStatus.find((item) => item.status === 'paid')?.count ?? 0,
    overdueCount: byStatus.find((item) => item.status === 'overdue')?.count ?? 0,
  };
}

export function getExpenseSettlement(snapshot: HouseholdSnapshot, today: ISODate) {
  const memberIds = snapshot.members.map((member) => member.id);
  const balances = Object.fromEntries(memberIds.map((memberId) => [memberId, 0])) as Record<
    string,
    number
  >;
  const monthlyPaidExpenses = snapshot.expenses.filter(
    (expense) =>
      expense.status === 'paid' && isSameMonth(fromIsoDate(expense.dueDate), fromIsoDate(today)),
  );

  monthlyPaidExpenses.forEach((expense) => {
    if (!expense.payerId || balances[expense.payerId] === undefined || memberIds.length === 0) {
      return;
    }

    balances[expense.payerId] += expense.amount;
    const customRatios = memberIds.map((memberId) =>
      Math.max(expense.splitRatio?.[memberId] ?? 0, 0),
    );
    const customTotal = customRatios.reduce((sum, ratio) => sum + ratio, 0);

    memberIds.forEach((memberId, index) => {
      const ratio = customTotal > 0 ? customRatios[index] / customTotal : 1 / memberIds.length;
      balances[memberId] -= expense.amount * ratio;
    });
  });

  const debtors = memberIds
    .map((memberId) => ({ memberId, amount: Math.max(-balances[memberId], 0) }))
    .filter((item) => item.amount >= 1)
    .sort((a, b) => b.amount - a.amount);
  const creditors = memberIds
    .map((memberId) => ({ memberId, amount: Math.max(balances[memberId], 0) }))
    .filter((item) => item.amount >= 1)
    .sort((a, b) => b.amount - a.amount);
  const transfers: { from: string; to: string; amount: number }[] = [];

  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.round(Math.min(debtor.amount, creditor.amount));

    if (amount >= 1) {
      transfers.push({ from: debtor.memberId, to: creditor.memberId, amount });
    }
    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount < 1) {
      debtorIndex += 1;
    }
    if (creditor.amount < 1) {
      creditorIndex += 1;
    }
  }

  return { balances, transfers };
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
    tone: 'accent',
  };
}
