import type { Expense, YearMonth } from './types';

type SettlementExpense = Pick<Expense, 'amount' | 'payerId' | 'splitRatio'>;
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

  const balances = Object.fromEntries(memberIds.map((id) => [id, 0])) as Record<string, number>;
  expenses.forEach((expense) => {
    if (!expense.payerId || balances[expense.payerId] === undefined) {
      return;
    }

    balances[expense.payerId] += expense.amount;
    const customShares = memberIds.map((id) => Math.max(expense.splitRatio?.[id] ?? 0, 0));
    const customTotal = customShares.reduce((sum, share) => sum + share, 0);
    const shares = customTotal > 0 ? customShares : memberIds.map(() => 1);
    const shareTotal = shares.reduce((sum, share) => sum + share, 0);

    memberIds.forEach((id, index) => {
      balances[id] -= (expense.amount * shares[index]) / shareTotal;
    });
  });

  const from = memberIds.find((id) => balances[id] < 0);
  const to = memberIds.find((id) => balances[id] > 0);
  if (!from || !to) {
    return null;
  }

  return { from, to, amount: Math.round(Math.min(-balances[from], balances[to])) };
}
