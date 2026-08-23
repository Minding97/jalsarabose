import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/app/action-button';
import { Card } from '@/components/app/card';
import { EmptyState } from '@/components/app/empty-state';
import { FormField } from '@/components/app/form-field';
import { Screen } from '@/components/app/screen';
import { SegmentedControl } from '@/components/app/segmented-control';
import { useTheme } from '@/hooks/use-theme';
import { expenseCategoryLabels, expenseStatusLabels } from '@/domain/labels';
import {
  createEqualContributions,
  formatYearMonth,
  getYearMonth,
  shiftYearMonth,
  validateMonthlyBudgetInput,
} from '@/domain/monthly-budget';
import {
  getMonthlyExpenseCommitmentSummary,
  validateRecurringExpenseTemplateInput,
} from '@/domain/recurring-expenses';
import {
  ContributionMode,
  Expense,
  ExpenseCategory,
  ExpenseStatus,
  RecurringExpenseTemplate,
  YearMonth,
} from '@/domain/types';
import { getExpenseOverview } from '@/domain/settlement';
import { useHouseholdStore } from '@/store/household-store';
import { formatKoreanDate, todayIso } from '@/utils/dates';
import { getExpenseSummary, getMemberName } from '@/utils/dashboard';
import { validateExpenseInput } from '@/utils/validation';

type ExpenseView = 'list' | 'dashboard' | 'fixed';
type SplitMode = 'equal' | 'custom';

export default function ExpensesScreen() {
  const theme = useTheme();
  const snapshot = useHouseholdStore();
  const addExpenseItem = useHouseholdStore((state) => state.addExpenseItem);
  const updateExpenseItem = useHouseholdStore((state) => state.updateExpenseItem);
  const deleteExpenseItem = useHouseholdStore((state) => state.deleteExpenseItem);
  const saveMonthlyBudgetItem = useHouseholdStore((state) => state.saveMonthlyBudgetItem);
  const addRecurringExpenseTemplateItem = useHouseholdStore(
    (state) => state.addRecurringExpenseTemplateItem,
  );
  const updateRecurringExpenseTemplateItem = useHouseholdStore(
    (state) => state.updateRecurringExpenseTemplateItem,
  );
  const deleteRecurringExpenseTemplateItem = useHouseholdStore(
    (state) => state.deleteRecurringExpenseTemplateItem,
  );
  const generateScheduledExpenseItems = useHouseholdStore(
    (state) => state.generateScheduledExpenseItems,
  );
  const confirmScheduledExpenseItem = useHouseholdStore(
    (state) => state.confirmScheduledExpenseItem,
  );
  const processScheduledExpenseItem = useHouseholdStore(
    (state) => state.processScheduledExpenseItem,
  );
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
  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateCategory, setTemplateCategory] = useState<ExpenseCategory>('utilities');
  const [templatePaymentDay, setTemplatePaymentDay] = useState('1');
  const [templateAmount, setTemplateAmount] = useState('');
  const [templateAmountKnown, setTemplateAmountKnown] = useState(true);
  const [templatePaymentMethod, setTemplatePaymentMethod] = useState('');
  const [templatePayerId, setTemplatePayerId] = useState(snapshot.members[0]?.id ?? '');
  const [templateStartsOn, setTemplateStartsOn] = useState<YearMonth>(currentMonth);
  const [templateActive, setTemplateActive] = useState(true);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateSubmitting, setTemplateSubmitting] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmingAmount, setConfirmingAmount] = useState('');
  const [scheduledMessage, setScheduledMessage] = useState<string | null>(null);

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
  const selectedScheduledExpenses = snapshot.scheduledExpenses.filter(
    (item) => item.month === selectedMonth,
  );
  const budgetSummary = getMonthlyExpenseCommitmentSummary(
    selectedBudget,
    snapshot.expenses,
    snapshot.scheduledExpenses,
    selectedMonth,
  );

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

  const resetTemplateForm = () => {
    setTemplateFormOpen(false);
    setEditingTemplateId(null);
    setTemplateTitle('');
    setTemplateCategory('utilities');
    setTemplatePaymentDay('1');
    setTemplateAmount('');
    setTemplateAmountKnown(true);
    setTemplatePaymentMethod('');
    setTemplatePayerId(snapshot.members[0]?.id ?? '');
    setTemplateStartsOn(currentMonth);
    setTemplateActive(true);
    setTemplateError(null);
  };

  const openNewTemplateForm = () => {
    resetTemplateForm();
    setTemplateStartsOn(selectedMonth);
    setTemplateFormOpen(true);
  };

  const editTemplate = (template: RecurringExpenseTemplate) => {
    setEditingTemplateId(template.id);
    setTemplateTitle(template.title);
    setTemplateCategory(template.category);
    setTemplatePaymentDay(String(template.paymentDay));
    setTemplateAmount(template.expectedAmount === null ? '' : String(template.expectedAmount));
    setTemplateAmountKnown(template.expectedAmount !== null);
    setTemplatePaymentMethod(template.paymentMethod ?? '');
    setTemplatePayerId(template.payerId ?? snapshot.members[0]?.id ?? '');
    setTemplateStartsOn(template.startsOn);
    setTemplateActive(template.active);
    setTemplateError(null);
    setTemplateFormOpen(true);
  };

  const submitTemplate = async () => {
    const payload = {
      title: templateTitle.trim(),
      category: templateCategory,
      frequency: 'monthly' as const,
      paymentDay: Number(templatePaymentDay),
      expectedAmount: templateAmountKnown ? parseWon(templateAmount) : null,
      paymentMethod: templatePaymentMethod.trim() || undefined,
      payerId: templatePayerId || undefined,
      startsOn: templateStartsOn,
      active: templateActive,
    };
    const validationMessage = validateRecurringExpenseTemplateInput(payload);
    if (validationMessage) {
      setTemplateError(validationMessage);
      return;
    }
    setTemplateSubmitting(true);
    try {
      if (editingTemplateId) {
        await updateRecurringExpenseTemplateItem(editingTemplateId, payload);
      } else {
        await addRecurringExpenseTemplateItem(payload);
      }
      resetTemplateForm();
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : '고정지출을 저장하지 못했어요.');
    } finally {
      setTemplateSubmitting(false);
    }
  };

  const removeTemplate = async () => {
    if (!editingTemplateId) return;
    setTemplateSubmitting(true);
    try {
      await deleteRecurringExpenseTemplateItem(editingTemplateId);
      resetTemplateForm();
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : '고정지출을 삭제하지 못했어요.');
    } finally {
      setTemplateSubmitting(false);
    }
  };

  const generateForSelectedMonth = async () => {
    setScheduledMessage(null);
    try {
      const count = await generateScheduledExpenseItems(selectedMonth);
      setScheduledMessage(count ? `${count}개 예정 지출을 만들었어요.` : '이미 모두 생성되어 있어요.');
    } catch (error) {
      setScheduledMessage(error instanceof Error ? error.message : '예정 지출을 만들지 못했어요.');
    }
  };

  const confirmAmount = async (scheduledExpenseId: string) => {
    try {
      await confirmScheduledExpenseItem(scheduledExpenseId, parseWon(confirmingAmount));
      setConfirmingId(null);
      setConfirmingAmount('');
      setScheduledMessage('금액을 확정했어요.');
    } catch (error) {
      setScheduledMessage(error instanceof Error ? error.message : '금액을 확정하지 못했어요.');
    }
  };

  const processScheduled = async (scheduledExpenseId: string) => {
    try {
      await processScheduledExpenseItem(scheduledExpenseId);
      setScheduledMessage('실제 지출로 처리했어요.');
    } catch (error) {
      setScheduledMessage(error instanceof Error ? error.message : '지출로 처리하지 못했어요.');
    }
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

  if (templateFormOpen) {
    return (
      <Screen testID="recurring-expense-template-form-screen">
        <FormHeader
          title={editingTemplateId ? '고정지출 수정' : '고정지출 등록'}
          onBack={resetTemplateForm}
        />
        <FormField
          label="고정지출명"
          value={templateTitle}
          onChangeText={setTemplateTitle}
          placeholder="예: 월세"
          testID="recurring-expense-title-input"
        />
        <ChipGroup
          label="카테고리"
          value={templateCategory}
          options={expenseCategoryOptions}
          onChange={setTemplateCategory}
        />
        <FormField
          label="매월 결제일"
          value={templatePaymentDay}
          onChangeText={setTemplatePaymentDay}
          placeholder="1~31"
          keyboardType="numeric"
          testID="recurring-expense-payment-day-input"
        />
        <ChipGroup
          label="금액"
          value={templateAmountKnown ? 'fixed' : 'variable'}
          options={[
            { value: 'fixed', label: '고정금액' },
            { value: 'variable', label: '매월 입력' },
          ]}
          onChange={(value) => setTemplateAmountKnown(value === 'fixed')}
        />
        {templateAmountKnown ? (
          <FormField
            label="예상금액"
            value={templateAmount}
            onChangeText={setTemplateAmount}
            placeholder="0"
            keyboardType="numeric"
            testID="recurring-expense-amount-input"
          />
        ) : null}
        <FormField
          label="결제수단"
          value={templatePaymentMethod}
          onChangeText={setTemplatePaymentMethod}
          placeholder="예: 생활비 계좌"
          testID="recurring-expense-payment-method-input"
        />
        <ChipGroup
          label="결제자"
          value={templatePayerId}
          options={snapshot.members.map((member) => ({
            value: member.id,
            label: getMemberName(snapshot.members, member.id),
          }))}
          onChange={setTemplatePayerId}
        />
        <FormField
          label="시작 월"
          value={templateStartsOn}
          onChangeText={(value) => setTemplateStartsOn(value as YearMonth)}
          placeholder="YYYY-MM"
          testID="recurring-expense-start-month-input"
        />
        <ChipGroup
          label="상태"
          value={templateActive ? 'active' : 'inactive'}
          options={[
            { value: 'active', label: '활성' },
            { value: 'inactive', label: '비활성' },
          ]}
          onChange={(value) => setTemplateActive(value === 'active')}
        />
        {templateError ? (
          <Text style={[styles.errorText, { color: theme.danger }]}>{templateError}</Text>
        ) : null}
        <View style={styles.formActions}>
          {editingTemplateId ? (
            <ActionButton
              testID="recurring-expense-delete-button"
              variant="secondary"
              onPress={removeTemplate}
              disabled={templateSubmitting}
              style={styles.deleteAction}>
              삭제
            </ActionButton>
          ) : null}
          <ActionButton
            testID="recurring-expense-submit-button"
            onPress={submitTemplate}
            disabled={
              templateSubmitting ||
              !templateTitle.trim() ||
              (templateAmountKnown && !templateAmount)
            }
            style={styles.saveAction}>
            저장
          </ActionButton>
        </View>
      </Screen>
    );
  }

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
        <FormField
          label="날짜"
          value={dueDate}
          onChangeText={setDueDate}
          placeholder="YYYY-MM-DD"
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
      floatingAction={
        <FloatingButton
          onPress={view === 'fixed' ? openNewTemplateForm : openNewForm}
          label={view === 'fixed' ? '고정지출 등록' : '지출 등록'}
        />
      }>
      <SegmentedControl
        value={view}
        options={[
          { value: 'list', label: '목록' },
          { value: 'dashboard', label: '대시보드' },
          { value: 'fixed', label: '고정지출' },
        ]}
        onChange={setView}
        accessibilityLabel="지출 보기"
      />

      <MonthSelector month={selectedMonth} onChange={setSelectedMonth} />

      {view === 'list' ? (
        <>
          <View style={styles.sectionHeadingRow}>
            <SectionTitle>예정 지출</SectionTitle>
            <ActionButton
              testID="scheduled-expense-generate-button"
              variant="secondary"
              onPress={generateForSelectedMonth}
              style={styles.compactAction}>
              생성
            </ActionButton>
          </View>
          {scheduledMessage ? (
            <Text style={[styles.helperText, { color: theme.textSecondary }]}>{scheduledMessage}</Text>
          ) : null}
          {selectedScheduledExpenses.length === 0 ? (
            <Text style={[styles.helperText, { color: theme.textSecondary }]}>
              고정지출에서 이번 달 예정 항목을 생성해보세요.
            </Text>
          ) : (
            selectedScheduledExpenses.map((scheduled) => (
              <Card key={scheduled.id} style={styles.listCard}>
                <View style={styles.rowHeading}>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: theme.text }]}>{scheduled.title}</Text>
                    <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
                      {formatKoreanDate(scheduled.dueDate)} ·{' '}
                      {scheduled.status === 'processed' ? '지출 처리 완료' : '예정'}
                    </Text>
                  </View>
                  <Text style={[styles.rowAmount, { color: theme.text }]}>
                    {scheduled.amount === null
                      ? '금액 입력 필요'
                      : `${scheduled.amount.toLocaleString()}원`}
                  </Text>
                </View>
                {scheduled.status === 'scheduled' ? (
                  confirmingId === scheduled.id ? (
                    <View style={styles.inlineActions}>
                      <View style={styles.inlineField}>
                        <FormField
                          label="확정금액"
                          value={confirmingAmount}
                          onChangeText={setConfirmingAmount}
                          placeholder="0"
                          keyboardType="numeric"
                          testID={`scheduled-expense-amount-${scheduled.id}`}
                        />
                      </View>
                      <ActionButton
                        onPress={() => confirmAmount(scheduled.id)}
                        disabled={!confirmingAmount}>
                        확정
                      </ActionButton>
                    </View>
                  ) : (
                    <View style={styles.inlineActions}>
                      {scheduled.amountStatus === 'needs-confirmation' ? (
                        <ActionButton
                          variant="secondary"
                          onPress={() => {
                            setConfirmingId(scheduled.id);
                            setConfirmingAmount('');
                          }}>
                          금액 입력
                        </ActionButton>
                      ) : null}
                      <ActionButton
                        testID={`scheduled-expense-process-${scheduled.id}`}
                        onPress={() => processScheduled(scheduled.id)}
                        disabled={scheduled.amountStatus === 'needs-confirmation'}>
                        지출 처리
                      </ActionButton>
                    </View>
                  )
                ) : null}
              </Card>
            ))
          )}

          <SectionTitle>실제 지출</SectionTitle>
          {groups.length === 0 ? (
            <EmptyState title="등록된 지출이 없어요." description="새 공동 지출을 등록해보세요." />
          ) : (
            groups.map(([date, expenses]) => (
              <View key={date} style={styles.group}>
                <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>
                  {formatKoreanDate(date)}
                </Text>
                {expenses.map((expense) => (
                  <Pressable
                    key={expense.id}
                    disabled={Boolean(expense.scheduledExpenseId)}
                    onPress={() => editExpense(expense)}>
                    <Card style={styles.listCard}>
                      <View style={styles.expenseRow}>
                        <View style={[styles.categoryBadge, { backgroundColor: theme.chip }]}>
                          <Text style={[styles.categoryShort, { color: theme.textSecondary }]}>
                            {expenseCategoryLabels[expense.category].slice(0, 2)}
                          </Text>
                        </View>
                        <View style={styles.rowText}>
                          <View style={styles.rowHeading}>
                            <Text style={[styles.rowTitle, { color: theme.text }]}>{expense.title}</Text>
                            <Text style={[styles.rowAmount, { color: theme.text }]}>
                              {expense.amount.toLocaleString()}원
                            </Text>
                          </View>
                          <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
                            {getMemberName(snapshot.members, expense.payerId)} 결제 ·{' '}
                            {expense.splitRatio ? '직접 분배' : '균등 분배'} ·{' '}
                            {expenseStatusLabels[expense.status]}
                            {expense.scheduledExpenseId ? ' · 고정지출에서 생성' : ''}
                          </Text>
                        </View>
                      </View>
                    </Card>
                  </Pressable>
                ))}
              </View>
            ))
          )}
        </>
      ) : view === 'fixed' ? (
        snapshot.recurringExpenseTemplates.length === 0 ? (
          <EmptyState
            title="고정지출이 없어요."
            description="월세·공과금 템플릿을 등록하면 월별 예정 지출을 만들 수 있어요."
          />
        ) : (
          snapshot.recurringExpenseTemplates.map((template) => (
            <Pressable key={template.id} onPress={() => editTemplate(template)}>
              <Card style={styles.listCard}>
                <View style={styles.rowHeading}>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: theme.text }]}>{template.title}</Text>
                    <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
                      매월 {template.paymentDay}일 · {template.active ? '활성' : '비활성'} ·{' '}
                      {template.paymentMethod || '결제수단 미지정'}
                    </Text>
                  </View>
                  <Text style={[styles.rowAmount, { color: theme.text }]}>
                    {template.expectedAmount === null
                      ? '매월 입력'
                      : `${template.expectedAmount.toLocaleString()}원`}
                  </Text>
                </View>
              </Card>
            </Pressable>
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
              <BudgetMetric label="예정 지출 합계" amount={budgetSummary.scheduledTotal} />
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
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  compactAction: {
    minHeight: 36,
    paddingVertical: 6,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  inlineActions: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
  },
  inlineField: {
    flex: 1,
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
