import { CircleCheckBig } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/app/card';
import { ListRow } from '@/components/app/list-row';
import { MetricCard } from '@/components/app/metric-card';
import { Screen } from '@/components/app/screen';
import { StatusPill } from '@/components/app/status-pill';
import { Spacing } from '@/constants/theme';
import { choreRepeatLabels, choreStatusLabels } from '@/domain/labels';
import { useTheme } from '@/hooks/use-theme';
import { useHouseholdStore } from '@/store/household-store';
import { formatKoreanDate, todayIso } from '@/utils/dates';
import { getChoreSummary, getMemberName } from '@/utils/dashboard';

export default function ChoresScreen() {
  const theme = useTheme();
  const snapshot = useHouseholdStore();
  const completeChore = useHouseholdStore((state) => state.completeChore);
  const summary = getChoreSummary(snapshot, todayIso());

  return (
    <Screen
      eyebrow="집안일"
      title="담당과 완료 상태"
      description="점수와 완료 기록으로 이번 달 분담 균형을 확인해요.">
      <View style={styles.metricGrid}>
        <MetricCard label="오늘 할 일" value={`${summary.todayCount}개`} tone="primary" />
        <MetricCard label="이번 주 예정" value={`${summary.weekCount}개`} tone="warning" />
        <MetricCard label="완료 점수" value={`${summary.completedScore}점`} tone="info" />
        <MetricCard label="미완료" value={`${summary.pendingCount}개`} tone="accent" />
      </View>

      <Card title="가구원별 수행 비율">
        {summary.contribution.map((member) => (
          <ListRow
            key={member.memberId}
            title={member.name}
            description={`${member.completedScore}점 완료`}
            right={<StatusPill label={`${member.ratio}%`} tone="primary" />}
          />
        ))}
      </Card>

      <Card title="집안일 목록">
        {snapshot.chores.map((chore) => (
          <ListRow
            key={chore.id}
            title={chore.title}
            description={`${formatKoreanDate(chore.dueDate)} · ${getMemberName(
              snapshot.members,
              chore.assigneeId,
            )} · ${choreRepeatLabels[chore.repeatCycle]}`}
            right={
              chore.status === 'scheduled' ? (
                <Pressable
                  onPress={() => completeChore(chore.id)}
                  style={({ pressed }) => [
                    styles.iconButton,
                    { borderColor: theme.border, opacity: pressed ? 0.65 : 1 },
                  ]}>
                  <CircleCheckBig size={18} color={theme.primary} strokeWidth={2.4} />
                  <Text style={[styles.iconButtonText, { color: theme.primary }]}>완료</Text>
                </Pressable>
              ) : (
                <StatusPill label={choreStatusLabels[chore.status]} tone="primary" />
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
