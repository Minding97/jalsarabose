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
