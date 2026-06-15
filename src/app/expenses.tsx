import { CheckCircle2 } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/app/card';
import { ListRow } from '@/components/app/list-row';
import { MetricCard } from '@/components/app/metric-card';
import { Screen } from '@/components/app/screen';
import { StatusPill } from '@/components/app/status-pill';
import { Spacing } from '@/constants/theme';
import { expenseCategoryLabels, expenseStatusLabels } from '@/domain/labels';
import { useTheme } from '@/hooks/use-theme';
import { useHouseholdStore } from '@/store/household-store';
import { formatKoreanDate, todayIso } from '@/utils/dates';
import { getExpenseSummary } from '@/utils/dashboard';

export default function ExpensesScreen() {
  const theme = useTheme();
  const snapshot = useHouseholdStore();
  const markExpensePaid = useHouseholdStore((state) => state.markExpensePaid);
  const summary = getExpenseSummary(snapshot, todayIso());

  return (
    <Screen
      eyebrow="공동 지출"
      title="생활비 납부 현황"
      description="공과금, 월세, 생활비를 납부일과 상태 기준으로 정리해요.">
      <View style={styles.metricGrid}>
        <MetricCard label="이번 달 총액" value={`${summary.total.toLocaleString()}원`} tone="info" />
        <MetricCard label="납부 예정" value={`${summary.scheduledCount}건`} tone="warning" />
        <MetricCard label="납부 완료" value={`${summary.paidCount}건`} tone="primary" />
        <MetricCard label="연체" value={`${summary.overdueCount}건`} tone="accent" />
      </View>

      <Card title="유형별 지출">
        {summary.byCategory.map((item) => (
          <ListRow
            key={item.category}
            title={expenseCategoryLabels[item.category]}
            description={`${item.count}건`}
            right={<StatusPill label={`${item.amount.toLocaleString()}원`} tone="info" />}
          />
        ))}
      </Card>

      <Card title="지출 목록">
        {snapshot.expenses.map((expense) => (
          <ListRow
            key={expense.id}
            title={expense.title}
            description={`${formatKoreanDate(expense.dueDate)} · ${
              expense.paymentMethod ?? '결제수단 미입력'
            }`}
            right={
              expense.status === 'scheduled' ? (
                <Pressable
                  onPress={() => markExpensePaid(expense.id)}
                  style={({ pressed }) => [
                    styles.iconButton,
                    { borderColor: theme.border, opacity: pressed ? 0.65 : 1 },
                  ]}>
                  <CheckCircle2 size={18} color={theme.primary} strokeWidth={2.4} />
                  <Text style={[styles.iconButtonText, { color: theme.primary }]}>완료</Text>
                </Pressable>
              ) : (
                <StatusPill label={expenseStatusLabels[expense.status]} tone="primary" />
              )
            }
          />
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  iconButton: {
    minHeight: 34,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  iconButtonText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
