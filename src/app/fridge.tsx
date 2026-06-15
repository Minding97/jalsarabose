import { CircleX, Utensils } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/app/card';
import { ListRow } from '@/components/app/list-row';
import { MetricCard } from '@/components/app/metric-card';
import { Screen } from '@/components/app/screen';
import { StatusPill } from '@/components/app/status-pill';
import { Spacing } from '@/constants/theme';
import { fridgeCategoryLabels, fridgeStatusLabels, storageTypeLabels } from '@/domain/labels';
import { FridgeStatus } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';
import { useHouseholdStore } from '@/store/household-store';
import { formatKoreanDate, todayIso } from '@/utils/dates';
import { getFridgeSummary } from '@/utils/dashboard';

export default function FridgeScreen() {
  const theme = useTheme();
  const snapshot = useHouseholdStore();
  const updateFridgeItemStatus = useHouseholdStore((state) => state.updateFridgeItemStatus);
  const summary = getFridgeSummary(snapshot, todayIso());

  const renderAction = (itemId: string, status: FridgeStatus) => (
    <View style={styles.actionGroup}>
      <Pressable
        onPress={() => updateFridgeItemStatus(itemId, 'used')}
        style={({ pressed }) => [
          styles.iconButton,
          { borderColor: theme.border, opacity: pressed ? 0.65 : 1 },
        ]}>
        <Utensils size={16} color={theme.primary} strokeWidth={2.4} />
      </Pressable>
      {status !== 'discarded' && (
        <Pressable
          onPress={() => updateFridgeItemStatus(itemId, 'discarded')}
          style={({ pressed }) => [
            styles.iconButton,
            { borderColor: theme.border, opacity: pressed ? 0.65 : 1 },
          ]}>
          <CircleX size={16} color={theme.danger} strokeWidth={2.4} />
        </Pressable>
      )}
    </View>
  );

  return (
    <Screen
      eyebrow="냉장고"
      title="재고와 유통기한"
      description="버리기 아까운 식재료를 먼저 챙길 수 있게 정리해요.">
      <View style={styles.metricGrid}>
        <MetricCard label="보관 중" value={`${summary.stockCount}개`} tone="primary" />
        <MetricCard label="3일 내 임박" value={`${summary.expiringCount}개`} tone="accent" />
        <MetricCard label="기한 초과" value={`${summary.expiredCount}개`} tone="warning" />
        <MetricCard label="최근 등록" value={`${summary.recentCount}개`} tone="info" />
      </View>

      <Card title="보관 위치별 현황">
        {summary.byStorage.map((item) => (
          <ListRow
            key={item.storageType}
            title={storageTypeLabels[item.storageType]}
            description={`${item.count}개`}
            right={<StatusPill label={`${item.expiringCount}개 임박`} tone="accent" />}
          />
        ))}
      </Card>

      <Card title="냉장고 목록">
        {snapshot.fridgeItems.map((item) => (
          <ListRow
            key={item.id}
            title={item.name}
            description={`${fridgeCategoryLabels[item.category]} · ${
              storageTypeLabels[item.storageType]
            } · ${item.expiryDate ? formatKoreanDate(item.expiryDate) : '기한 없음'}`}
            right={
              item.status === 'stocked' ? (
                renderAction(item.id, item.status)
              ) : (
                <StatusPill label={fridgeStatusLabels[item.status]} tone="accent" />
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
  actionGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
