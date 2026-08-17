import { addDays, subDays } from 'date-fns';

import { HouseholdSnapshot } from '@/domain/types';
import { createEqualContributions, getYearMonth } from '@/domain/monthly-budget';
import { toIsoDate } from '@/utils/dates';

export function createSeedState(baseDate = new Date()): HouseholdSnapshot {
  const today = toIsoDate(baseDate);
  const yesterday = toIsoDate(subDays(baseDate, 1));
  const tomorrow = toIsoDate(addDays(baseDate, 1));
  const inFourDays = toIsoDate(addDays(baseDate, 4));
  const inSixDays = toIsoDate(addDays(baseDate, 6));

  const householdId = 'household-woorijip';
  const minseoId = 'member-minseo';
  const jihoonId = 'member-jihoon';
  const currentMonth = getYearMonth(today);
  const monthlyBudgetAmount = 1_000_000;

  return {
    household: {
      id: householdId,
      name: '우리집',
      inviteCode: 'JALSAL-24',
      createdBy: minseoId,
      createdAt: today,
      memberIds: [minseoId, jihoonId],
    },
    members: [
      {
        id: minseoId,
        householdId,
        userId: 'user-minseo',
        name: '민서',
        role: 'admin',
        joinedAt: today,
      },
      {
        id: jihoonId,
        householdId,
        userId: 'user-jihoon',
        name: '지훈',
        role: 'member',
        joinedAt: today,
      },
    ],
    monthlyBudgets: [
      {
        id: currentMonth,
        householdId,
        month: currentMonth,
        totalAmount: monthlyBudgetAmount,
        contributionMode: 'equal',
        memberContributions: createEqualContributions(monthlyBudgetAmount, [minseoId, jihoonId]),
        createdBy: minseoId,
        createdAt: today,
        updatedBy: minseoId,
        updatedAt: today,
      },
    ],
    expenses: [
      {
        id: 'expense-maintenance',
        householdId,
        title: '관리비',
        category: 'utilities',
        amount: 185000,
        dueDate: tomorrow,
        paymentMethod: '생활비 계좌',
        payerId: minseoId,
        splitRatio: { [minseoId]: 50, [jihoonId]: 50 },
        isRecurring: true,
        status: 'scheduled',
        memo: '납부 후 영수증 확인',
        createdBy: minseoId,
        createdAt: today,
        notificationEnabled: true,
      },
      {
        id: 'expense-internet',
        householdId,
        title: '인터넷 요금',
        category: 'subscription',
        amount: 33000,
        dueDate: inFourDays,
        paymentMethod: '신한카드',
        payerId: jihoonId,
        splitRatio: { [minseoId]: 50, [jihoonId]: 50 },
        isRecurring: true,
        status: 'scheduled',
        createdBy: jihoonId,
        createdAt: today,
        notificationEnabled: true,
      },
      {
        id: 'expense-groceries',
        householdId,
        title: '이번 주 장보기',
        category: 'living',
        amount: 76400,
        dueDate: yesterday,
        paymentMethod: '민서 개인카드',
        payerId: minseoId,
        splitRatio: { [minseoId]: 50, [jihoonId]: 50 },
        isRecurring: false,
        status: 'paid',
        createdBy: minseoId,
        createdAt: yesterday,
        notificationEnabled: false,
      },
    ],
    fridgeItems: [
      {
        id: 'fridge-milk',
        householdId,
        name: '우유',
        category: 'dairy',
        quantity: '1팩',
        storageType: 'fridge',
        expiryDate: tomorrow,
        status: 'stocked',
        memo: '개봉함',
        createdBy: minseoId,
        createdAt: today,
        notificationEnabled: true,
      },
      {
        id: 'fridge-eggs',
        householdId,
        name: '계란',
        category: 'dairy',
        quantity: '8개',
        storageType: 'fridge',
        expiryDate: inFourDays,
        status: 'stocked',
        createdBy: jihoonId,
        createdAt: today,
        notificationEnabled: true,
      },
      {
        id: 'fridge-kimchi',
        householdId,
        name: '김치',
        category: 'side',
        quantity: '반 통',
        storageType: 'fridge',
        status: 'stocked',
        createdBy: minseoId,
        createdAt: yesterday,
        notificationEnabled: false,
      },
      {
        id: 'fridge-frozen-meat',
        householdId,
        name: '냉동 삼겹살',
        category: 'meat',
        quantity: '500g',
        storageType: 'freezer',
        expiryDate: inSixDays,
        status: 'stocked',
        createdBy: jihoonId,
        createdAt: today,
        notificationEnabled: true,
      },
    ],
  };
}
