import { CalendarClock, CheckCircle2, ReceiptText, Refrigerator } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/app/card';
import { ListRow } from '@/components/app/list-row';
import { MetricCard } from '@/components/app/metric-card';
import { Screen } from '@/components/app/screen';
import { StatusPill } from '@/components/app/status-pill';
import { Spacing } from '@/constants/theme';
import { expenseStatusLabels, fridgeStatusLabels } from '@/domain/labels';
import { useHouseholdStore } from '@/store/household-store';
import { formatKoreanDate, todayIso } from '@/utils/dates';
import { getHomeSummary } from '@/utils/dashboard';

export default function HomeScreen() {
  const snapshot = useHouseholdStore();
  const today = todayIso();
  const summary = getHomeSummary(snapshot, today);

  return (
    <Screen
      eyebrow="오늘의 우리집"
      title={snapshot.household.name}
      description={`${formatKoreanDate(today)} 기준으로 같이 챙길 일을 모았어요.`}>
      <View style={styles.metricGrid}>
        <MetricCard
          icon={CheckCircle2}
          label="오늘 집안일"
          value={`${summary.todayChores.length}개`}
          tone="primary"
        />
        <MetricCard
          icon={ReceiptText}
          label="이번 달 지출"
          value={`${summary.monthlyExpenseTotal.toLocaleString()}원`}
          tone="info"
        />
        <MetricCard
          icon={Refrigerator}
          label="임박 식재료"
          value={`${summary.expiringFridgeItems.length}개`}
          tone="accent"
        />
        <MetricCard
          icon={CalendarClock}
          label="7일 내 일정"
          value={`${summary.upcomingEvents.length}개`}
          tone="warning"
        />
      </View>

      <Card title="오늘 같이 챙길 일">
        {summary.todayEvents.map((event) => (
          <ListRow
            key={event.id}
            title={event.title}
            description={event.subtitle}
            right={<StatusPill label={event.typeLabel} tone={event.tone} />}
          />
        ))}
      </Card>

      <Card title="다가오는 지출">
        {summary.upcomingExpenses.map((expense) => (
          <ListRow
            key={expense.id}
            title={expense.title}
            description={`${formatKoreanDate(expense.dueDate)} · ${expense.amount.toLocaleString()}원`}
            right={<StatusPill label={expenseStatusLabels[expense.status]} tone="info" />}
          />
        ))}
      </Card>

      <Card title="유통기한 임박">
        {summary.expiringFridgeItems.map((item) => (
          <ListRow
            key={item.id}
            title={item.name}
            description={`${formatKoreanDate(item.expiryDate ?? today)} · ${item.quantity ?? '수량 미입력'}`}
            right={<StatusPill label={fridgeStatusLabels[item.status]} tone="accent" />}
          />
        ))}
      </Card>

      <Card title="이번 달 집안일 균형">
        {summary.choreContribution.map((member) => (
          <ListRow
            key={member.memberId}
            title={member.name}
            description={`${member.completedScore}점 완료`}
            right={<StatusPill label={`${member.ratio}%`} tone="primary" />}
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
});
