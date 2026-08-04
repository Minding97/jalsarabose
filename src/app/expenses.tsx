import { ChevronLeft, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { ActionButton } from '@/components/app/action-button';
import { Card } from '@/components/app/card';
import { EmptyState } from '@/components/app/empty-state';
import { FormField } from '@/components/app/form-field';
import { Screen } from '@/components/app/screen';
import { SegmentedControl } from '@/components/app/segmented-control';
import { useTheme } from '@/hooks/use-theme';
import { expenseCategoryLabels, expenseStatusLabels } from '@/domain/labels';
import { Expense, ExpenseCategory, ExpenseStatus } from '@/domain/types';
import { useHouseholdStore } from '@/store/household-store';
import { formatKoreanDate, todayIso } from '@/utils/dates';
import { getExpenseSettlement, getExpenseSummary, getMemberName } from '@/utils/dashboard';
import { normalizeSplitRatio } from '@/utils/expense-split';
import { validateExpenseInput } from '@/utils/validation';

type ExpenseView = 'list' | 'dashboard';
type SplitMode = 'equal' | 'custom';

export default function ExpensesScreen() {
  const theme = useTheme();
  const snapshot = useHouseholdStore();
  const addExpenseItem = useHouseholdStore((state) => state.addExpenseItem);
  const updateExpenseItem = useHouseholdStore((state) => state.updateExpenseItem);
  const deleteExpenseItem = useHouseholdStore((state) => state.deleteExpenseItem);
  const summary = getExpenseSummary(snapshot, todayIso());
  const [view, setView] = useState<ExpenseView>('list');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(todayIso());
  const [category, setCategory] = useState<ExpenseCategory>('living');
  const [status, setStatus] = useState<ExpenseStatus>('scheduled');
  const [payerId, setPayerId] = useState(snapshot.members[0]?.id ?? '');
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [shares, setShares] = useState<Record<string, string>>({});
  const [paymentMethod, setPaymentMethod] = useState('');
  const [memo, setMemo] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const groups = useMemo(() => {
    const grouped = snapshot.expenses.reduce<Record<string, Expense[]>>((acc, expense) => {
      acc[expense.dueDate] ??= [];
      acc[expense.dueDate].push(expense);
      return acc;
    }, {});

    return Object.entries(grouped).sort(([dateA], [dateB]) => dateB.localeCompare(dateA));
  }, [snapshot.expenses]);

  const maxCategoryAmount = Math.max(...summary.byCategory.map((item) => item.amount), 1);
  const maxPaymentMethodAmount = Math.max(
    ...summary.byPaymentMethod.map((item) => item.amount),
    1,
  );
  const settlement = getExpenseSettlement(snapshot, todayIso());

  const resetForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setTitle('');
    setAmount('');
    setDueDate(todayIso());
    setCategory('living');
    setStatus('scheduled');
    setPayerId(snapshot.members[0]?.id ?? '');
    setSplitMode('equal');
    setShares({});
    setPaymentMethod('');
    setMemo('');
    setIsRecurring(false);
    setNotificationEnabled(true);
    setFormError(null);
  };

  const openNewForm = () => {
    resetForm();
    setFormOpen(true);
  };

  const editExpense = (expense: Expense) => {
    const normalizedSplitRatio = normalizeSplitRatio(
      expense.splitRatio,
      snapshot.members.map((member) => member.id),
    );

    setEditingId(expense.id);
    setTitle(expense.title);
    setAmount(String(expense.amount));
    setDueDate(expense.dueDate);
    setCategory(expense.category);
    setStatus(expense.status);
    setPayerId(expense.payerId ?? snapshot.members[0]?.id ?? '');
    setSplitMode(normalizedSplitRatio ? 'custom' : 'equal');
    setShares(
      Object.fromEntries(
        Object.entries(normalizedSplitRatio ?? {}).map(([memberId, value]) => [
          memberId,
          String(value),
        ]),
      ),
    );
    setPaymentMethod(expense.paymentMethod ?? '');
    setMemo(expense.memo ?? '');
    setIsRecurring(expense.isRecurring);
    setNotificationEnabled(expense.notificationEnabled);
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
      paymentMethod: paymentMethod.trim() || undefined,
      payerId,
      splitRatio,
      isRecurring,
      memo: memo.trim() || undefined,
      notificationEnabled,
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
        <FormField
          label="결제수단"
          value={paymentMethod}
          onChangeText={setPaymentMethod}
          placeholder="예: 공동 체크카드"
          testID="expense-payment-method-input"
        />
        <ChipGroup
          label="카테고리"
          value={category}
          options={expenseCategoryOptions}
          onChange={setCategory}
          testIDPrefix="expense-category"
        />
        <ChipGroup
          label="결제자"
          value={payerId}
          options={snapshot.members.map((member) => ({
            value: member.id,
            label: getMemberName(snapshot.members, member.id),
          }))}
          onChange={setPayerId}
          testIDPrefix="expense-payer"
        />
        <ChipGroup
          label="분담 방식"
          value={splitMode}
          options={[
            { value: 'equal', label: '균등' },
            { value: 'custom', label: '직접 입력' },
          ]}
          onChange={setSplitMode}
          testIDPrefix="expense-split"
        />
        {splitMode === 'custom' ? (
          <View style={styles.shareFields}>
            {snapshot.members.map((member) => (
              <FormField
                key={member.id}
                label={`${getMemberName(snapshot.members, member.id)} 분담 비율 (%)`}
                value={shares[member.id] ?? ''}
                onChangeText={(value) =>
                  setShares((current) => ({ ...current, [member.id]: value }))
                }
                placeholder="0"
                keyboardType="numeric"
                testID={`expense-share-${member.id}-input`}
              />
            ))}
          </View>
        ) : null}
        <ChipGroup
          label="납부 상태"
          value={status}
          options={expenseStatusOptions}
          onChange={setStatus}
          testIDPrefix="expense-status"
        />
        <FormField
          label="메모"
          value={memo}
          onChangeText={setMemo}
          placeholder="필요한 내용을 남겨주세요"
          testID="expense-memo-input"
        />
        <SettingToggle
          label="반복 지출"
          description="같은 지출이 정기적으로 발생해요"
          value={isRecurring}
          onValueChange={setIsRecurring}
          testID="expense-recurring-switch"
        />
        <SettingToggle
          label="납부 알림"
          description="납부일이 다가오면 결제자에게 알려줘요"
          value={notificationEnabled}
          onValueChange={setNotificationEnabled}
          testID="expense-notification-switch"
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
                <Pressable
                  key={expense.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${expense.title} 지출 수정`}
                  testID={`expense-item-${expense.id}`}
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
                          <Text style={[styles.rowTitle, { color: theme.text }]}>
                            {expense.title}
                          </Text>
                          <Text style={[styles.rowAmount, { color: theme.text }]}>
                            {expense.amount.toLocaleString()}원
                          </Text>
                        </View>
                        <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
                          {getMemberName(snapshot.members, expense.payerId)} 결제 ·{' '}
                          {expense.paymentMethod || '결제수단 미지정'} ·{' '}
                          {expense.splitRatio ? '직접 분배' : '균등 분배'} ·{' '}
                          {expenseStatusLabels[expense.status]}
                          {expense.isRecurring ? ' · 반복' : ''}
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
            <Text style={[styles.dashboardLabel, { color: theme.textSecondary }]}>
              이번 달 총 지출
            </Text>
            <Text style={[styles.totalValue, { color: theme.text }]}>
              {summary.total.toLocaleString()}원
            </Text>
            <Text style={[styles.dashboardHelper, { color: theme.textSecondary }]}>
              1인당{' '}
              {Math.round(summary.total / Math.max(snapshot.members.length, 1)).toLocaleString()}원
            </Text>
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

          <SectionTitle>결제수단별 지출</SectionTitle>
          <View style={styles.bars} testID="expense-payment-method-summary">
            {summary.byPaymentMethod.map((item) => (
              <ProgressRow
                key={item.paymentMethod}
                label={item.paymentMethod}
                value={`${item.amount.toLocaleString()}원 · ${item.count}건`}
                percent={(item.amount / maxPaymentMethodAmount) * 100}
              />
            ))}
          </View>

          <SectionTitle>납부 상태</SectionTitle>
          <View style={styles.statusSummary} testID="expense-status-summary">
            {summary.byStatus.map((item) => (
              <View
                key={item.status}
                style={[styles.statusSummaryItem, { borderColor: theme.border }]}>
                <Text style={[styles.statusSummaryLabel, { color: theme.textSecondary }]}>
                  {expenseStatusLabels[item.status]}
                </Text>
                <Text style={[styles.statusSummaryValue, { color: theme.text }]}>
                  {item.amount.toLocaleString()}원
                </Text>
                <Text style={[styles.statusSummaryCount, { color: theme.textTertiary }]}>
                  {item.count}건
                </Text>
              </View>
            ))}
          </View>

          <SectionTitle>정산</SectionTitle>
          <Card style={styles.settlementCard} testID="expense-settlement-summary">
            {settlement.transfers.length > 0 ? (
              settlement.transfers.map((transfer) => (
                <Text
                  key={`${transfer.from}-${transfer.to}`}
                  style={[styles.settlementText, { color: theme.text }]}>
                  {getMemberName(snapshot.members, transfer.from)}님이{' '}
                  {getMemberName(snapshot.members, transfer.to)}님에게{' '}
                  {transfer.amount.toLocaleString()}원 보내기
                </Text>
              ))
            ) : (
              <Text style={[styles.settlementText, { color: theme.text }]}>정산할 금액이 없어요</Text>
            )}
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

function ChipGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  testIDPrefix,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  testIDPrefix?: string;
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
              accessibilityLabel={`${label} ${option.label}`}
              testID={testIDPrefix ? `${testIDPrefix}-${option.value}` : undefined}
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

function SettingToggle({
  label,
  description,
  value,
  onValueChange,
  testID,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.toggleRow, { borderColor: theme.border }]}>
      <View style={styles.toggleText}>
        <Text style={[styles.toggleLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.toggleDescription, { color: theme.textSecondary }]}>
          {description}
        </Text>
      </View>
      <Switch
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.chip, true: theme.primarySoft }}
        thumbColor={value ? theme.primary : theme.textTertiary}
      />
    </View>
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
            {
              backgroundColor: theme.primary,
              width: `${percent <= 0 ? 0 : Math.max(Math.min(percent, 100), 4)}%`,
            },
          ]}
        />
      </View>
    </View>
  );
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
    gap: 8,
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
  toggleRow: {
    minHeight: 64,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 8,
  },
  toggleText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  toggleLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  toggleDescription: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  statusSummary: {
    flexDirection: 'row',
    gap: 8,
  },
  statusSummaryItem: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 2,
  },
  statusSummaryLabel: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  statusSummaryValue: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
  },
  statusSummaryCount: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
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
