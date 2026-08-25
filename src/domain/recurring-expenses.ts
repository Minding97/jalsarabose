import type {
  Expense,
  MonthlyBudget,
  RecurringExpenseTemplate,
  RecurringExpenseTemplateInput,
  ScheduledExpense,
  YearMonth,
} from './types';

const YEAR_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

function isValidYearMonth(value: string): value is YearMonth {
  const match = YEAR_MONTH_PATTERN.exec(value);
  return Boolean(match && Number(match[2]) >= 1 && Number(match[2]) <= 12);
}

export function validateRecurringExpenseTemplateInput(
  input: RecurringExpenseTemplateInput,
): string | null {
  if (!input.title.trim()) return '고정지출명을 입력해주세요.';
  if (input.frequency !== 'monthly') return '현재는 매월 반복만 설정할 수 있어요.';
  if (!Number.isInteger(input.paymentDay) || input.paymentDay < 1 || input.paymentDay > 31) {
    return '결제일은 1일부터 31일 사이로 입력해주세요.';
  }
  if (!isValidYearMonth(input.startsOn)) return '시작 월은 YYYY-MM 형식으로 입력해주세요.';
  if (
    input.expectedAmount !== null &&
    (!Number.isSafeInteger(input.expectedAmount) || input.expectedAmount < 0)
  ) {
    return '예상금액은 0원 이상의 원 단위 정수이거나 미정이어야 해요.';
  }
  return null;
}

export function scheduledExpenseId(templateId: string, month: YearMonth): string {
  if (!templateId || !isValidYearMonth(month)) {
    throw new Error('예정 지출 ID를 만들려면 템플릿과 올바른 월이 필요해요.');
  }
  return `${templateId}__${month}`;
}

export function dueDateForMonth(month: YearMonth, paymentDay: number): string {
  if (!isValidYearMonth(month) || !Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 31) {
    throw new Error('올바른 월과 1일부터 31일 사이의 결제일이 필요해요.');
  }
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(Math.min(paymentDay, lastDay)).padStart(2, '0')}`;
}

export function createScheduledExpense(
  template: RecurringExpenseTemplate,
  month: YearMonth,
  generatedAt: string,
): ScheduledExpense | null {
  if (!template.active || template.frequency !== 'monthly' || template.startsOn > month) return null;
  if (!isValidYearMonth(month)) throw new Error('생성할 월은 YYYY-MM 형식이어야 해요.');

  return {
    id: scheduledExpenseId(template.id, month),
    householdId: template.householdId,
    templateId: template.id,
    month,
    title: template.title,
    category: template.category,
    dueDate: dueDateForMonth(month, template.paymentDay),
    amount: template.expectedAmount,
    amountStatus: template.expectedAmount === null ? 'needs-confirmation' : 'estimated',
    paymentMethod: template.paymentMethod,
    payerId: template.payerId,
    status: 'scheduled',
    generatedAt,
    updatedAt: generatedAt,
  };
}

export function getMissingScheduledExpenses(
  templates: RecurringExpenseTemplate[],
  existing: Pick<ScheduledExpense, 'id'>[],
  month: YearMonth,
  generatedAt: string,
): ScheduledExpense[] {
  const existingIds = new Set(existing.map(({ id }) => id));
  return templates.flatMap((template) => {
    const scheduled = createScheduledExpense(template, month, generatedAt);
    return scheduled && !existingIds.has(scheduled.id) ? [scheduled] : [];
  });
}

export function confirmScheduledExpenseAmount(
  scheduled: ScheduledExpense,
  amount: number,
  updatedAt: string,
): ScheduledExpense {
  if (scheduled.status === 'processed') throw new Error('이미 실제 지출로 처리된 항목이에요.');
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error('확정금액은 0원 이상의 원 단위 정수여야 해요.');
  }
  return { ...scheduled, amount, amountStatus: 'confirmed', updatedAt };
}

export function expenseFromScheduledExpense(
  scheduled: ScheduledExpense,
  expenseId: string,
  createdBy: string,
  createdAt: string,
): Expense {
  if (scheduled.status === 'processed') throw new Error('이미 실제 지출로 처리된 항목이에요.');
  if (scheduled.amount === null || scheduled.amountStatus === 'needs-confirmation') {
    throw new Error('금액을 먼저 확정해주세요.');
  }
  return {
    id: expenseId,
    householdId: scheduled.householdId,
    title: scheduled.title,
    category: scheduled.category,
    amount: scheduled.amount,
    dueDate: scheduled.dueDate,
    paymentMethod: scheduled.paymentMethod,
    payerId: scheduled.payerId,
    isRecurring: true,
    status: 'paid',
    createdBy,
    createdAt,
    notificationEnabled: false,
    recurringTemplateId: scheduled.templateId,
    scheduledExpenseId: scheduled.id,
  };
}

export function getMonthlyExpenseCommitmentSummary(
  budget: Pick<MonthlyBudget, 'month' | 'totalAmount'> | undefined,
  expenses: Pick<Expense, 'amount' | 'dueDate'>[],
  scheduledExpenses: Pick<ScheduledExpense, 'amount' | 'month' | 'status'>[],
  month: YearMonth,
) {
  if (!isValidYearMonth(month)) throw new Error('조회할 월은 YYYY-MM 형식이어야 해요.');
  const expenseTotal = expenses
    .filter((expense) => expense.dueDate.slice(0, 7) === month)
    .reduce((sum, expense) => sum + expense.amount, 0);
  const scheduledTotal = scheduledExpenses
    .filter((scheduled) => scheduled.month === month && scheduled.status === 'scheduled')
    .reduce((sum, scheduled) => sum + (scheduled.amount ?? 0), 0);
  const needsConfirmationCount = scheduledExpenses.filter(
    (scheduled) =>
      scheduled.month === month && scheduled.status === 'scheduled' && scheduled.amount === null,
  ).length;
  const budgetTotal = budget?.month === month ? budget.totalAmount : null;
  return {
    expenseTotal,
    scheduledTotal,
    needsConfirmationCount,
    budgetTotal,
    remainingAmount:
      budgetTotal === null ? null : budgetTotal - expenseTotal - scheduledTotal,
  };
}
