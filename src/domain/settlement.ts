import type { Expense, YearMonth } from './types';

type SettlementExpense = Pick<Expense, 'amount' | 'payerId'>;
type DatedSettlementExpense = SettlementExpense & Pick<Expense, 'dueDate'>;

export function getExpenseOverview<T extends DatedSettlementExpense>(
  expenses: T[],
  selectedMonth: YearMonth,
  memberIds: string[],
) {
  return {
    monthlyExpenses: expenses.filter(
      (expense) => expense.dueDate.slice(0, 7) === selectedMonth,
    ),
    settlement: getSettlement(expenses, memberIds),
  };
}

export function getSettlement(expenses: SettlementExpense[], memberIds: string[]) {
  if (memberIds.length !== 2 || expenses.length === 0) {
    return null;
  }

  const paid = Object.fromEntries(memberIds.map((id) => [id, 0])) as Record<string, number>;
  expenses.forEach((expense) => {
    if (expense.payerId && paid[expense.payerId] !== undefined) {
      paid[expense.payerId] += expense.amount;
    }
  });

  const total = Object.values(paid).reduce((sum, value) => sum + value, 0);
  const target = total / 2;
  const from = memberIds.find((id) => paid[id] < target);
  const to = memberIds.find((id) => paid[id] > target);
  if (!from || !to) {
    return null;
  }

  return { from, to, amount: Math.round(target - paid[from]) };
}
