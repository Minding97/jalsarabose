import type {
  Expense,
  HouseholdMember,
  MonthlyBudget,
  MonthlyBudgetInput,
  YearMonth,
} from './types';

const YEAR_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

export function isValidYearMonth(value: string): value is YearMonth {
  const match = YEAR_MONTH_PATTERN.exec(value);
  return Boolean(match && Number(match[2]) >= 1 && Number(match[2]) <= 12);
}

export function getYearMonth(date: string): YearMonth {
  const month = date.slice(0, 7);
  if (!isValidYearMonth(month)) {
    throw new Error('날짜는 YYYY-MM 형식의 월을 포함해야 해요.');
  }
  return month;
}

export function shiftYearMonth(month: YearMonth, amount: number): YearMonth {
  if (!isValidYearMonth(month) || !Number.isInteger(amount)) {
    throw new Error('올바른 월과 정수 이동값이 필요해요.');
  }

  const [year, monthNumber] = month.split('-').map(Number);
  const absoluteMonth = year * 12 + monthNumber - 1 + amount;
  const nextYear = Math.floor(absoluteMonth / 12);
  const nextMonth = ((absoluteMonth % 12) + 12) % 12 + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`;
}

export function formatYearMonth(month: YearMonth): string {
  if (!isValidYearMonth(month)) {
    return month;
  }
  const [year, monthNumber] = month.split('-').map(Number);
  return `${year}년 ${monthNumber}월`;
}

export function createEqualContributions(totalAmount: number, memberIds: string[]) {
  if (!Number.isSafeInteger(totalAmount) || totalAmount < 0 || memberIds.length !== 2) {
    throw new Error('두 구성원의 부담금을 계산하려면 0원 이상의 정수 금액이 필요해요.');
  }

  const firstContribution = Math.ceil(totalAmount / 2);
  return {
    [memberIds[0]]: firstContribution,
    [memberIds[1]]: totalAmount - firstContribution,
  };
}

export function validateMonthlyBudgetInput(
  input: MonthlyBudgetInput,
  members: Pick<HouseholdMember, 'id'>[],
): string | null {
  if (!isValidYearMonth(input.month)) {
    return '대상 월은 YYYY-MM 형식으로 입력해주세요.';
  }
  if (members.length !== 2) {
    return '공동생활비는 구성원이 정확히 2명일 때 설정할 수 있어요.';
  }
  if (!Number.isSafeInteger(input.totalAmount) || input.totalAmount <= 0) {
    return '월 공동생활비는 0보다 큰 원 단위 정수로 입력해주세요.';
  }

  const memberIds = members.map((member) => member.id);
  const contributionIds = Object.keys(input.memberContributions);
  if (
    contributionIds.length !== memberIds.length ||
    memberIds.some((memberId) => !contributionIds.includes(memberId))
  ) {
    return '두 구성원의 부담금을 모두 입력해주세요.';
  }

  const contributions = memberIds.map((memberId) => input.memberContributions[memberId]);
  if (contributions.some((amount) => !Number.isSafeInteger(amount) || amount < 0)) {
    return '구성원 부담금은 0원 이상의 원 단위 정수로 입력해주세요.';
  }

  const contributionTotal = contributions.reduce((sum, amount) => sum + amount, 0);
  if (contributionTotal !== input.totalAmount) {
    return `구성원 부담금 합계 ${contributionTotal.toLocaleString()}원이 월 공동생활비 ${input.totalAmount.toLocaleString()}원과 일치해야 해요.`;
  }

  if (input.contributionMode === 'equal') {
    const equalContributions = createEqualContributions(input.totalAmount, memberIds);
    if (memberIds.some((memberId) => equalContributions[memberId] !== input.memberContributions[memberId])) {
      return '균등 부담금은 월 공동생활비를 50:50으로 나눈 금액이어야 해요.';
    }
  }

  return null;
}

export function getMonthlyBudgetSummary(
  budget: Pick<MonthlyBudget, 'month' | 'totalAmount'> | undefined,
  expenses: Pick<Expense, 'amount' | 'dueDate'>[],
  month: YearMonth,
) {
  if (!isValidYearMonth(month)) {
    throw new Error('조회할 월은 YYYY-MM 형식이어야 해요.');
  }

  const expenseTotal = expenses
    .filter((expense) => expense.dueDate.slice(0, 7) === month)
    .reduce((sum, expense) => sum + expense.amount, 0);
  const monthlyBudget = budget?.month === month ? budget.totalAmount : null;

  return {
    expenseTotal,
    budgetTotal: monthlyBudget,
    remainingAmount: monthlyBudget === null ? null : monthlyBudget - expenseTotal,
  };
}
