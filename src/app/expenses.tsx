import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/app/action-button';
import { Card } from '@/components/app/card';
import { DatePickerField } from '@/components/app/date-picker-field';
import { EmptyState } from '@/components/app/empty-state';
import { FormField } from '@/components/app/form-field';
import { Screen } from '@/components/app/screen';
import { SegmentedControl } from '@/components/app/segmented-control';
import { useTheme } from '@/hooks/use-theme';
import { expenseCategoryLabels, expenseStatusLabels } from '@/domain/labels';
import {
  createEqualContributions,
  formatYearMonth,
  getMonthlyBudgetSummary,
  getYearMonth,
  shiftYearMonth,
  validateMonthlyBudgetInput,
} from '@/domain/monthly-budget';
import {
  ContributionMode,
  Expense,
  ExpenseCategory,
  ExpenseStatus,
  YearMonth,
} from '@/domain/types';
import { getExpenseOverview } from '@/domain/settlement';
import { useHouseholdStore } from '@/store/household-store';
import { formatKoreanDate, todayIso } from '@/utils/dates';
import { getExpenseSummary, getMemberName } from '@/utils/dashboard';
import { validateExpenseInput } from '@/utils/validation';

type ExpenseView = 'list' | 'dashboard';
type SplitMode = 'equal' | 'custom';

export default function ExpensesScreen() {
  const theme = useTheme();
  const snapshot = useHouseholdStore();
  const addExpenseItem = useHouseholdStore((state) => state.addExpenseItem);
  const updateExpenseItem = useHouseholdStore((state) => state.updateExpenseItem);
  const deleteExpenseItem = useHouseholdStore((state) => state.deleteExpenseItem);
  const saveMonthlyBudgetItem = useHouseholdStore((state) => state.saveMonthlyBudgetItem);
  const currentMonth = getYearMonth(todayIso());
  const [selectedMonth, setSelectedMonth] = useState<YearMonth>(currentMonth);
  const summary = getExpenseSummary(snapshot, `${selectedMonth}-01`);
  const [view, setView] = useState<ExpenseView>('list');
  const [formOpen, setFormOpen] = useState(false);
  const [budgetFormOpen, setBudgetFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(todayIso());
  const [category, setCategory] = useState<ExpenseCategory>('living');
  const [status, setStatus] = useState<ExpenseStatus>('scheduled');
  const [payerId, setPayerId] = useState(snapshot.members[0]?.id ?? '');
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [shares, setShares] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [budgetTotal, setBudgetTotal] = useState('');
  const [contributionMode, setContributionMode] = useState<ContributionMode>('equal');
  const [budgetShares, setBudgetShares] = useState<Record<string, string>>({});
  const [budgetFormError, setBudgetFormError] = useState<string | null>(null);
  const [budgetSubmitting, setBudgetSubmitting] = useState(false);

  const selectedBudget = snapshot.monthlyBudgets.find((budget) => budget.month === selectedMonth);
  const { monthlyExpenses: selectedExpenses, settlement } = useMemo(
    () =>
      getExpenseOverview(
        snapshot.expenses,
        selectedMonth,
        snapshot.members.map((member) => member.id),
      ),
    [selectedMonth, snapshot.expenses, snapshot.members],
  );
  const budgetSummary = getMonthlyBudgetSummary(selectedBudget, snapshot.expenses, selectedMonth);

  const groups = useMemo(() => {
    const grouped = selectedExpenses.reduce<Record<string, Expense[]>>((acc, expense) => {
      acc[expense.dueDate] ??= [];
      acc[expense.dueDate].push(expense);
      return acc;
    }, {});

    return Object.entries(grouped).sort(([dateA], [dateB]) => dateB.localeCompare(dateA));
  }, [selectedExpenses]);

  const maxCategoryAmount = Math.max(...summary.byCategory.map((item) => item.amount), 1);

  const resetForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setTitle('');
    setAmount('');
    setDueDate(getDefaultDueDate(selectedMonth, currentMonth));
    setCategory('living');
    setStatus('scheduled');
    setPayerId(snapshot.members[0]?.id ?? '');
    setSplitMode('equal');
    setShares({});
    setFormError(null);
  };

  const openNewForm = () => {
    resetForm();
    setFormOpen(true);
  };

  const openBudgetForm = () => {
    setBudgetTotal(selectedBudget ? String(selectedBudget.totalAmount) : '');
    setContributionMode(selectedBudget?.contributionMode ?? 'equal');
    setBudgetShares(
      Object.fromEntries(
        Object.entries(selectedBudget?.memberContributions ?? {}).map(([memberId, amount]) => [
          memberId,
          String(amount),
        ]),
      ),
    );
    setBudgetFormError(null);
    setBudgetFormOpen(true);
  };

  const closeBudgetForm = () => {
    setBudgetFormOpen(false);
    setBudgetFormError(null);
  };

  const submitBudget = async () => {
    const totalAmount = parseWon(budgetTotal);
    let memberContributions: Record<string, number>;

    try {
      memberContributions =
        contributionMode === 'equal'
          ? createEqualContributions(totalAmount, snapshot.members.map((member) => member.id))
          : Object.fromEntries(
              snapshot.members.map((member) => [member.id, parseWon(budgetShares[member.id] ?? '')]),
            );
    } catch (error) {
      setBudgetFormError(error instanceof Error ? error.message : '부담금을 계산하지 못했어요.');
      return;
    }

    const validationMessage = validateMonthlyBudgetInput(
      { month: selectedMonth, totalAmount, contributionMode, memberContributions },
      snapshot.members,
    );
    if (validationMessage) {
      setBudgetFormError(validationMessage);
      return;
    }

    setBudgetSubmitting(true);
    try {
      await saveMonthlyBudgetItem({
        month: selectedMonth,
        totalAmount,
        contributionMode,
        memberContributions,
      });
      closeBudgetForm();
    } catch (error) {
      setBudgetFormError(error instanceof Error ? error.message : '공동생활비를 저장하지 못했어요.');
    } finally {
      setBudgetSubmitting(false);
    }
  };

  const editExpense = (expense: Expense) => {
    setEditingId(expense.id);
    setTitle(expense.title);
    setAmount(String(expense.amount));
    setDueDate(expense.dueDate);
    setCategory(expense.category);
    setStatus(expense.status);
    setPayerId(expense.payerId ?? snapshot.members[0]?.id ?? '');
    setSplitMode(expense.splitRatio ? 'custom' : 'equal');
    setShares(
      Object.fromEntries(
        Object.entries(expense.splitRatio ?? {}).map(([memberId, value]) => [
          memberId,
          String(value),
        ]),
      ),
    );
    setFormError(null);
    setFormOpen(true);
  };

  const submit = async () => {
    const splitRatio =
      splitMode === 'custom'
        ? Object.fromEntries(
            snapshot.members.map((member) => [member.id, Number(shares[member.id] ?? 0)]),
          )
        : undefined;
    const payload = {
      title: title.trim(),
      amount: Number(amount.replace(/,/g, '')),
      dueDate,
      category,
      status,
      paymentMethod: undefined,
      payerId,
      splitRatio,
      isRecurring: false,
      memo: undefined,
      notificationEnabled: true,
    };
    const validationMessage = validateExpenseInput(payload);

    if (validationMessage) {
      setFormError(validationMessage);
      return;
    }

    setSubmitting(true);
    try {
      if (editingId) {
        await updateExpenseItem(editingId, payload);
      } else {
        await addExpenseItem(payload);
      }
      resetForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '지출을 저장하지 못했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!editingId) {
      return;
    }
    setSubmitting(true);
    try {
      await deleteExpenseItem(editingId);
      resetForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '지출을 삭제하지 못했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  if (budgetFormOpen) {
    const parsedTotal = parseWon(budgetTotal);
    const equalContributions =
      Number.isSafeInteger(parsedTotal) && parsedTotal >= 0 && snapshot.members.length === 2
        ? createEqualContributions(parsedTotal, snapshot.members.map((member) => member.id))
        : {};
    const customTotal = snapshot.members.reduce(
      (sum, member) => sum + parseWon(budgetShares[member.id] ?? ''),
      0,
    );

    return (
      <Screen testID="monthly-budget-form-screen">
        <FormHeader title={`${formatYearMonth(selectedMonth)} 공동생활비`} onBack={closeBudgetForm} />
        <FormField
          label="월 공동생활비"
          value={budgetTotal}
          onChangeText={setBudgetTotal}
          placeholder="예: 1,000,000"
          keyboardType="numeric"
          testID="monthly-budget-total-input"
        />
        <ChipGroup
          label="부담 방식"
          value={contributionMode}
          options={[
            { value: 'equal', label: '50:50' },
            { value: 'custom', label: '직접 입력' },
          ]}
          onChange={(mode) => {
            setContributionMode(mode);
            setBudgetFormError(null);
          }}
        />
        <Card title="구성원별 부담금" style={styles.contributionCard}>
          {snapshot.members.map((member) => (
            <View key={member.id}>
              {contributionMode === 'custom' ? (
                <FormField
                  label={`${getMemberName(snapshot.members, member.id)} 부담금`}
                  value={budgetShares[member.id] ?? ''}
                  onChangeText={(value) =>
                    setBudgetShares((current) => ({ ...current, [member.id]: value }))
                  }
                  placeholder="0"
                  keyboardType="numeric"
                  testID={`monthly-budget-share-${member.id}`}
                />
              ) : (
                <View style={styles.contributionRow}>
                  <Text style={[styles.contributionName, { color: theme.textSecondary }]}>
                    {getMemberName(snapshot.members, member.id)}
                  </Text>
                  <Text style={[styles.contributionAmount, { color: theme.text }]}>
                    {(equalContributions[member.id] ?? 0).toLocaleString()}원
                  </Text>
                </View>
              )}
            </View>
          ))}
          {contributionMode === 'custom' ? (
            <Text
              style={[
                styles.contributionTotal,
                { color: customTotal === parsedTotal ? theme.primary : theme.danger },
              ]}>
              부담금 합계 {customTotal.toLocaleString()}원 / {parsedTotal.toLocaleString()}원
            </Text>
          ) : null}
        </Card>
        {snapshot.members.length !== 2 ? (
          <Text style={[styles.errorText, { color: theme.danger }]}>
            공동생활비는 구성원이 정확히 2명일 때 설정할 수 있어요.
          </Text>
        ) : null}
        {budgetFormError ? (
          <Text style={[styles.errorText, { color: theme.danger }]}>{budgetFormError}</Text>
        ) : null}
        <ActionButton
          testID="monthly-budget-submit-button"
          onPress={submitBudget}
          disabled={budgetSubmitting || !budgetTotal || snapshot.members.length !== 2}>
          저장
        </ActionButton>
      </Screen>
    );
  }

  if (formOpen) {
    return (
      <Screen testID="expense-form-screen">
        <FormHeader title={editingId ? '지출 수정' : '지출 등록'} onBack={resetForm} />
        <FormField
          label="금액"
          value={amount}
          onChangeText={setAmount}
          placeholder="0"
          keyboardType="numeric"
          testID="expense-amount-input"
        />
        <FormField
          label="항목명"
          value={title}
          onChangeText={setTitle}
          placeholder="예: 주간 장보기"
          testID="expense-title-input"
        />
        <DatePickerField
          label="날짜"
          value={dueDate}
          onChange={setDueDate}
          testID="expense-due-date-input"
        />
        <ChipGroup
          label="카테고리"
          value={category}
          options={expenseCategoryOptions}
          onChange={setCategory}
        />
        <ChipGroup
          label="결제자"
          value={payerId}
          options={snapshot.members.map((member) => ({
            value: member.id,
            label: getMemberName(snapshot.members, member.id),
          }))}
          onChange={setPayerId}
        />
        <ChipGroup
          label="분배 방식"
          value={splitMode}
          options={[
            { value: 'equal', label: '균등' },
            { value: 'custom', label: '직접 입력' },
          ]}
          onChange={setSplitMode}
        />
        {splitMode === 'custom' ? (
          <View style={styles.shareFields}>
            {snapshot.members.map((member) => (
              <FormField
                key={member.id}
                label={`${getMemberName(snapshot.members, member.id)} 부담액`}
                value={shares[member.id] ?? ''}
                onChangeText={(value) =>
                  setShares((current) => ({ ...current, [member.id]: value }))
                }
                placeholder="0"
                keyboardType="numeric"
              />
            ))}
          </View>
        ) : null}
        <ChipGroup
          label="납부 상태"
          value={status}
          options={expenseStatusOptions}
          onChange={setStatus}
        />
        {formError ? <Text style={[styles.errorText, { color: theme.danger }]}>{formError}</Text> : null}
        <View style={styles.formActions}>
          {editingId ? (
            <ActionButton
              testID="expense-delete-button"
              variant="secondary"
              onPress={remove}
              disabled={submitting}
              style={styles.deleteAction}>
              삭제
            </ActionButton>
          ) : null}
          <ActionButton
            testID="expense-submit-button"
            onPress={submit}
            disabled={submitting || !title.trim() || !amount}
            style={styles.saveAction}>
            저장
          </ActionButton>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title="지출"
      testID="expenses-screen"
      floatingAction={<FloatingButton onPress={openNewForm} label="지출 등록" />}>
      <SegmentedControl
        value={view}
        options={[
          { value: 'list', label: '목록' },
          { value: 'dashboard', label: '대시보드' },
        ]}
        onChange={setView}
        accessibilityLabel="지출 보기"
      />

      <MonthSelector month={selectedMonth} onChange={setSelectedMonth} />

      {view === 'list' ? (
        groups.length === 0 ? (
          <EmptyState title="등록된 지출이 없어요." description="새 공동 지출을 등록해보세요." />
        ) : (
          groups.map(([date, expenses]) => (
            <View key={date} style={styles.group}>
              <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>
                {formatKoreanDate(date)}
              </Text>
              {expenses.map((expense) => (
                <Pressable key={expense.id} onPress={() => editExpense(expense)}>
                  <Card style={styles.listCard}>
                    <View style={styles.expenseRow}>
                      <View style={[styles.categoryBadge, { backgroundColor: theme.chip }]}>
                        <Text style={[styles.categoryShort, { color: theme.textSecondary }]}>
                          {expenseCategoryLabels[expense.category].slice(0, 2)}
                        </Text>
                      </View>
                      <View style={styles.rowText}>
                        <View style={styles.rowHeading}>
                          <Text style={[styles.rowTitle, { color: theme.text }]}>
                            {expense.title}
                          </Text>
                          <Text style={[styles.rowAmount, { color: theme.text }]}>
                            {expense.amount.toLocaleString()}원
                          </Text>
                        </View>
                        <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
                          {getMemberName(snapshot.members, expense.payerId)} 결제 ·{' '}
                          {expense.splitRatio ? '직접 분배' : '균등 분배'} ·{' '}
                          {expenseStatusLabels[expense.status]}
                        </Text>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              ))}
            </View>
          ))
        )
      ) : (
        <>
          <Card style={styles.totalCard}>
            <View style={styles.budgetHeading}>
              <View style={styles.budgetTitleBlock}>
                <Text style={[styles.dashboardLabel, { color: theme.textSecondary }]}>
                  월 공동생활비
                </Text>
                <Text style={[styles.totalValue, { color: theme.text }]}>
                  {budgetSummary.budgetTotal === null
                    ? '미설정'
                    : `${budgetSummary.budgetTotal.toLocaleString()}원`}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={selectedBudget ? '공동생활비 수정' : '공동생활비 설정'}
                testID="monthly-budget-edit-button"
                onPress={openBudgetForm}
                style={[styles.budgetEditButton, { backgroundColor: theme.primarySoft }]}>
                <Text style={[styles.budgetEditText, { color: theme.primary }]}>
                  {selectedBudget ? '수정' : '설정'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.budgetMetrics}>
              <BudgetMetric label="실제 지출 합계" amount={budgetSummary.expenseTotal} />
              <BudgetMetric
                label={
                  budgetSummary.remainingAmount !== null && budgetSummary.remainingAmount < 0
                    ? '초과 생활비'
                    : '남은 생활비'
                }
                amount={
                  budgetSummary.remainingAmount === null
                    ? null
                    : Math.abs(budgetSummary.remainingAmount)
                }
                danger={
                  budgetSummary.remainingAmount !== null && budgetSummary.remainingAmount < 0
                }
              />
            </View>
            {selectedBudget ? (
              <View style={[styles.budgetContributions, { borderTopColor: theme.border }]}>
                {snapshot.members.map((member) => (
                  <View key={member.id} style={styles.contributionRow}>
                    <Text style={[styles.contributionName, { color: theme.textSecondary }]}>
                      {getMemberName(snapshot.members, member.id)} 부담금
                    </Text>
                    <Text style={[styles.contributionAmount, { color: theme.text }]}>
                      {(selectedBudget.memberContributions[member.id] ?? 0).toLocaleString()}원
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.dashboardHelper, { color: theme.textSecondary }]}>
                공동생활비를 설정하면 지출 후 남은 금액을 확인할 수 있어요.
              </Text>
            )}
          </Card>

          <SectionTitle>카테고리별 지출</SectionTitle>
          <View style={styles.bars}>
            {summary.byCategory.map((item) => (
              <ProgressRow
                key={item.category}
                label={expenseCategoryLabels[item.category]}
                value={`${item.amount.toLocaleString()}원`}
                percent={(item.amount / maxCategoryAmount) * 100}
              />
            ))}
          </View>

          <SectionTitle>정산</SectionTitle>
          <Card style={styles.settlementCard}>
            <Text style={[styles.settlementText, { color: theme.text }]}>
              {settlement
                ? `${getMemberName(snapshot.members, settlement.from)}님이 ${getMemberName(
                    snapshot.members,
                    settlement.to,
                  )}님에게 ${settlement.amount.toLocaleString()}원 보내면 정산 완료`
                : '정산할 금액이 없어요'}
            </Text>
          </Card>
        </>
      )}
    </Screen>
  );
}

function FormHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.formHeader}>
      <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={onBack}>
        <ChevronLeft size={22} color={theme.textSecondary} strokeWidth={2} />
      </Pressable>
      <Text style={[styles.formTitle, { color: theme.text }]}>{title}</Text>
    </View>
  );
}

function MonthSelector({
  month,
  onChange,
}: {
  month: YearMonth;
  onChange: (month: YearMonth) => void;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.monthSelector, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="이전 달"
        testID="expense-previous-month"
        onPress={() => onChange(shiftYearMonth(month, -1))}
        style={styles.monthButton}>
        <ChevronLeft size={20} color={theme.textSecondary} strokeWidth={2} />
      </Pressable>
      <Text testID="expense-selected-month" style={[styles.monthLabel, { color: theme.text }]}>
        {formatYearMonth(month)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="다음 달"
        testID="expense-next-month"
        onPress={() => onChange(shiftYearMonth(month, 1))}
        style={styles.monthButton}>
        <ChevronRight size={20} color={theme.textSecondary} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

function BudgetMetric({
  label,
  amount,
  danger = false,
}: {
  label: string;
  amount: number | null;
  danger?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={styles.budgetMetric}>
      <Text style={[styles.budgetMetricLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.budgetMetricValue, { color: danger ? theme.danger : theme.text }]}>
        {amount === null ? '-' : `${amount.toLocaleString()}원`}
      </Text>
    </View>
  );
}

function ChipGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.chipSection}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[
                styles.chip,
                { backgroundColor: selected ? theme.primarySoft : theme.chip },
              ]}>
              <Text
                style={[
                  styles.chipText,
                  { color: selected ? theme.primary : theme.textSecondary },
                ]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function FloatingButton({ onPress, label }: { onPress: () => void; label: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID="expense-add-button"
      onPress={onPress}
      style={[styles.fab, { backgroundColor: theme.primary }]}>
      <Plus size={27} color="#FFFFFF" strokeWidth={2} />
    </Pressable>
  );
}

function SectionTitle({ children }: { children: string }) {
  const theme = useTheme();
  return <Text style={[styles.sectionTitle, { color: theme.text }]}>{children}</Text>;
}

function ProgressRow({
  label,
  value,
  percent,
}: {
  label: string;
  value: string;
  percent: number;
}) {
  const theme = useTheme();
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressHeader}>
        <Text style={[styles.progressLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.progressValue, { color: theme.textSecondary }]}>{value}</Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: theme.chip }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: theme.primary, width: `${Math.max(percent, 4)}%` },
          ]}
        />
      </View>
    </View>
  );
}

function parseWon(value: string) {
  return Number(value.replace(/,/g, '').trim());
}

function getDefaultDueDate(selectedMonth: YearMonth, currentMonth: YearMonth) {
  return selectedMonth === currentMonth ? todayIso() : `${selectedMonth}-01`;
}

const expenseCategoryOptions = Object.entries(expenseCategoryLabels).map(([value, label]) => ({
  value: value as ExpenseCategory,
  label,
}));

const expenseStatusOptions = Object.entries(expenseStatusLabels).map(([value, label]) => ({
  value: value as ExpenseStatus,
  label,
}));

const styles = StyleSheet.create({
  monthSelector: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthButton: {
    width: 48,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  group: {
    gap: 8,
    marginBottom: 4,
  },
  groupLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  listCard: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryShort: {
    fontSize: 11,
    fontWeight: '700',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  rowMeta: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  rowAmount: {
    flexShrink: 0,
    fontSize: 14,
    fontWeight: '700',
  },
  totalCard: {
    padding: 18,
  },
  budgetHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  budgetTitleBlock: {
    flex: 1,
  },
  budgetEditButton: {
    minHeight: 34,
    borderRadius: 100,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetEditText: {
    fontSize: 13,
    fontWeight: '700',
  },
  budgetMetrics: {
    flexDirection: 'row',
    gap: 10,
  },
  budgetMetric: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  budgetMetricLabel: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  budgetMetricValue: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  budgetContributions: {
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 6,
  },
  contributionCard: {
    borderRadius: 14,
  },
  contributionRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  contributionName: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  contributionAmount: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  contributionTotal: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'right',
  },
  dashboardLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  totalValue: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '800',
  },
  dashboardHelper: {
    fontSize: 13,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  bars: {
    gap: 10,
    marginBottom: 6,
  },
  progressRow: {
    gap: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  progressValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  settlementCard: {
    borderRadius: 16,
    padding: 14,
  },
  settlementText: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 8px 20px rgba(23, 184, 84, 0.28)',
    elevation: 8,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 2,
  },
  formTitle: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '800',
  },
  chipSection: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 36,
    borderRadius: 100,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  shareFields: {
    gap: 10,
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  deleteAction: {
    flex: 1,
  },
  saveAction: {
    flex: 2,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
});
