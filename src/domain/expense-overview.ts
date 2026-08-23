import type { Expense, YearMonth } from './types';

type OverviewExpense = Pick<Expense, 'amount' | 'category' | 'dueDate' | 'status'>;

export function getMonthlyExpenseOverview<T extends OverviewExpense>(
  expenses: T[],
  selectedMonth: YearMonth,
) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth)) {
    throw new Error('조회할 월은 YYYY-MM 형식이어야 해요.');
  }

  const monthlyExpenses = expenses.filter(
    (expense) => expense.dueDate.slice(0, 7) === selectedMonth,
  );
  const usedExpenses = monthlyExpenses.filter((expense) => expense.status === 'paid');
  const scheduledExpenses = monthlyExpenses.filter((expense) => expense.status === 'scheduled');
  const recentExpenses = [...usedExpenses].sort((left, right) =>
    right.dueDate.localeCompare(left.dueDate),
  );
  const byCategory = Object.values(
    usedExpenses.reduce<
      Record<string, { category: Expense['category']; amount: number; count: number }>
    >((categories, expense) => {
      categories[expense.category] ??= { category: expense.category, amount: 0, count: 0 };
      categories[expense.category].amount += expense.amount;
      categories[expense.category].count += 1;
      return categories;
    }, {}),
  ).sort((left, right) => right.amount - left.amount);

  return {
    monthlyExpenses,
    usedExpenses,
    scheduledExpenses,
    recentExpenses,
    byCategory,
  };
}
