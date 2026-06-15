import { create } from 'zustand';

import { createSeedState } from '@/data/seed';
import { ExpenseStatus, FridgeStatus, HouseholdSnapshot } from '@/domain/types';

type HouseholdActions = {
  completeChore: (choreId: string) => void;
  markExpensePaid: (expenseId: string) => void;
  updateExpenseStatus: (expenseId: string, status: ExpenseStatus) => void;
  updateFridgeItemStatus: (itemId: string, status: FridgeStatus) => void;
};

export const useHouseholdStore = create<HouseholdSnapshot & HouseholdActions>((set) => ({
  ...createSeedState(),
  completeChore: (choreId) =>
    set((state) => ({
      chores: state.chores.map((chore) =>
        chore.id === choreId ? { ...chore, status: 'done' } : chore,
      ),
    })),
  markExpensePaid: (expenseId) =>
    set((state) => ({
      expenses: state.expenses.map((expense) =>
        expense.id === expenseId ? { ...expense, status: 'paid' } : expense,
      ),
    })),
  updateExpenseStatus: (expenseId, status) =>
    set((state) => ({
      expenses: state.expenses.map((expense) =>
        expense.id === expenseId ? { ...expense, status } : expense,
      ),
    })),
  updateFridgeItemStatus: (itemId, status) =>
    set((state) => ({
      fridgeItems: state.fridgeItems.map((item) =>
        item.id === itemId ? { ...item, status } : item,
      ),
    })),
}));
