import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/app/card';
import { EmptyState } from '@/components/app/empty-state';
import { Screen } from '@/components/app/screen';
import { ProfileSheet } from '@/components/profile-sheet';
import { useTheme } from '@/hooks/use-theme';
import { useHouseholdStore } from '@/store/household-store';
import { formatKoreanDate, todayIso } from '@/utils/dates';
import { getHomeSummary, getMemberDisplayName, getMemberName } from '@/utils/dashboard';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const snapshot = useHouseholdStore();
  const currentUser = useHouseholdStore((state) => state.currentUser);
  const [profileOpen, setProfileOpen] = useState(false);
  const today = todayIso();
  const summary = getHomeSummary(snapshot, today);
  const greetingName =
    currentUser?.displayName || snapshot.members[0]?.name || snapshot.household.name;

  return (
    <>
      <Screen testID="home-screen">
        <View style={styles.homeHeader}>
          <View style={styles.greeting}>
            <Text style={[styles.date, { color: theme.textSecondary }]}>
              {formatKoreanDate(today)}
            </Text>
            <Text style={[styles.greetingTitle, { color: theme.text }]}>
              {greetingName}님, 안녕하세요
            </Text>
          </View>
          <Pressable
            testID="profile-open-button"
            accessibilityRole="button"
            accessibilityLabel="마이페이지 열기"
            onPress={() => setProfileOpen(true)}
            style={styles.profileAvatar}>
            <Text style={styles.profileInitial}>{greetingName.slice(0, 1)}</Text>
          </Pressable>
        </View>

        <View style={styles.memberChips}>
          {snapshot.members.map((member, index) => {
            const memberName = getMemberDisplayName(member, index);
            return (
              <View
                key={member.id}
                style={[
                  styles.memberChip,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}>
                <View
                  style={[
                    styles.memberAvatar,
                    { backgroundColor: index % 2 === 0 ? '#14140F' : '#2B2A28' },
                  ]}>
                  <Text style={styles.memberInitial}>{memberName.slice(0, 1)}</Text>
                </View>
                <Text style={[styles.memberName, { color: theme.text }]}>{memberName}</Text>
              </View>
            );
          })}
        </View>

        <Card style={styles.todayCard}>
          <View style={styles.cardHeading}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>오늘 일정</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/calendar')}>
              <Text style={[styles.cardLink, { color: theme.textSecondary }]}>캘린더 보기</Text>
            </Pressable>
          </View>
          {summary.todayEvents.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              오늘 등록된 일정이 없어요
            </Text>
          ) : (
            summary.todayEvents.slice(0, 3).map((event) => (
              <View key={event.id} style={styles.scheduleRow}>
                <View style={[styles.dot, { backgroundColor: theme.primary }]} />
                <Text style={[styles.scheduleTitle, { color: theme.text }]}>{event.title}</Text>
                <Text style={[styles.scheduleTime, { color: theme.textSecondary }]}>
                  {event.typeLabel}
                </Text>
              </View>
            ))
          )}
        </Card>

        <View style={styles.summaryGrid}>
          <Pressable style={styles.summaryPressable} onPress={() => router.push('/expenses')}>
            <Card style={styles.summaryCard}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>이번 달 지출</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>
                {summary.monthlyExpenseTotal.toLocaleString()}원
              </Text>
              <Text style={[styles.summaryHelper, { color: theme.textSecondary }]}>
                1인당{' '}
                {Math.round(
                  summary.monthlyExpenseTotal / Math.max(snapshot.members.length, 1),
                ).toLocaleString()}
                원
              </Text>
            </Card>
          </Pressable>
          <Pressable style={styles.summaryPressable} onPress={() => router.push('/fridge')}>
            <Card style={styles.summaryCard}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>유통기한 임박</Text>
              <Text style={[styles.summaryValue, { color: theme.primary }]}>
                {summary.expiringFridgeItems.length}건
              </Text>
              <Text style={[styles.summaryHelper, { color: theme.textSecondary }]} numberOfLines={1}>
                {summary.expiringFridgeItems.map((item) => item.name).join(', ') || '여유 있어요'}
              </Text>
            </Card>
          </Pressable>
        </View>

        <Pressable onPress={() => router.push('/chores')}>
          <Card>
            <View style={styles.cardHeading}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>오늘의 집안일</Text>
              <Text style={[styles.cardLink, { color: theme.textSecondary }]}>
                {summary.todayChores.length}개 예정
              </Text>
            </View>
            {snapshot.chores.filter((chore) => chore.dueDate === today).length === 0 ? (
              <EmptyState title="오늘 예정된 집안일이 없어요." />
            ) : (
              snapshot.chores
                .filter((chore) => chore.dueDate === today)
                .slice(0, 4)
                .map((chore) => {
                  const memberName = getMemberName(snapshot.members, chore.assigneeId);
                  return (
                    <View key={chore.id} style={styles.choreRow}>
                      <View style={styles.choreAvatar}>
                        <Text style={styles.choreInitial}>{memberName.slice(0, 1)}</Text>
                      </View>
                      <Text style={[styles.choreTitle, { color: theme.text }]}>{chore.title}</Text>
                      <Text
                        style={[
                          styles.choreStatus,
                          { color: chore.status === 'done' ? theme.primary : theme.textSecondary },
                        ]}>
                        {chore.status === 'done' ? '완료' : '대기'}
                      </Text>
                    </View>
                  );
                })
            )}
          </Card>
        </Pressable>
      </Screen>

      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  homeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  greeting: {
    flex: 1,
  },
  date: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    marginBottom: 4,
  },
  greetingTitle: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '800',
  },
  profileAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2B2A28',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  memberChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    marginBottom: 6,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 100,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 12,
  },
  memberAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitial: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  memberName: {
    fontSize: 13,
    fontWeight: '500',
  },
  todayCard: {
    marginTop: 4,
  },
  cardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  cardLink: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
    paddingVertical: 6,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  scheduleTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  scheduleTime: {
    fontSize: 13,
    fontWeight: '500',
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryPressable: {
    flex: 1,
  },
  summaryCard: {
    minHeight: 100,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '800',
  },
  summaryHelper: {
    fontSize: 12,
    fontWeight: '500',
  },
  choreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  choreAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2B2A28',
    alignItems: 'center',
    justifyContent: 'center',
  },
  choreInitial: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  choreTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  choreStatus: {
    fontSize: 13,
    fontWeight: '600',
  },
});
