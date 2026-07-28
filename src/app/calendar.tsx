import { addDays, addMonths, eachDayOfInterval, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton } from '@/components/app/action-button';
import { Card } from '@/components/app/card';
import { EmptyState } from '@/components/app/empty-state';
import { Screen } from '@/components/app/screen';
import { useTheme } from '@/hooks/use-theme';
import { useHouseholdStore } from '@/store/household-store';
import { formatKoreanDate, fromIsoDate, toIsoDate, todayIso } from '@/utils/dates';
import { getCalendarEvents } from '@/utils/dashboard';

type LocalEvent = {
  id: string;
  title: string;
  time: string;
  date: string;
};

export default function CalendarScreen() {
  const theme = useTheme();
  const snapshot = useHouseholdStore();
  const today = todayIso();
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(fromIsoDate(today)));
  const [selectedDate, setSelectedDate] = useState(today);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('');
  const [localEvents, setLocalEvents] = useState<LocalEvent[]>([]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(visibleMonth, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end: addDays(start, 41) });
  }, [visibleMonth]);

  const generatedEvents = getCalendarEvents(snapshot);
  const selectedGeneratedEvents = generatedEvents.filter((event) => event.date === selectedDate);
  const selectedLocalEvents = localEvents.filter((event) => event.date === selectedDate);

  const saveLocalEvent = () => {
    if (!newTitle.trim()) {
      return;
    }

    setLocalEvents((events) => [
      ...events,
      {
        id: `local-${Date.now()}`,
        title: newTitle.trim(),
        time: newTime.trim() || '종일',
        date: selectedDate,
      },
    ]);
    setNewTitle('');
    setNewTime('');
    setAdding(false);
  };

  const moveMonth = (offset: number) => {
    const nextMonth = addMonths(visibleMonth, offset);
    setVisibleMonth(nextMonth);
    setSelectedDate(toIsoDate(startOfMonth(nextMonth)));
  };

  return (
    <Screen title="캘린더" testID="calendar-screen">
      <View style={styles.monthNavigation}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="이전 달"
          onPress={() => moveMonth(-1)}
          style={styles.monthButton}>
          <ChevronLeft size={19} color={theme.textSecondary} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.monthTitle, { color: theme.text }]}>
          {formatKoreanDate(toIsoDate(visibleMonth), 'yyyy년 M월')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다음 달"
          onPress={() => moveMonth(1)}
          style={styles.monthButton}>
          <ChevronRight size={19} color={theme.textSecondary} strokeWidth={2} />
        </Pressable>
      </View>

      <View style={styles.weekHeader}>
        {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
          <Text key={day} style={[styles.weekday, { color: theme.textSecondary }]}>
            {day}
          </Text>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {monthDays.map((date) => {
          const isoDate = toIsoDate(date);
          const selected = isoDate === selectedDate;
          const inMonth = isSameMonth(date, visibleMonth);
          const hasEvents =
            generatedEvents.some((event) => event.date === isoDate) ||
            localEvents.some((event) => event.date === isoDate);

          return (
            <Pressable
              key={isoDate}
              accessibilityRole="button"
              accessibilityLabel={`${formatKoreanDate(isoDate)} 선택`}
              onPress={() => setSelectedDate(isoDate)}
              style={[styles.dayCell, { opacity: inMonth ? 1 : 0.35 }]}>
              <View
                style={[
                  styles.dayCircle,
                  { backgroundColor: selected ? theme.primary : 'transparent' },
                ]}>
                <Text
                  style={[
                    styles.dayNumber,
                    { color: selected ? '#FFFFFF' : theme.text, fontWeight: selected ? '700' : '500' },
                  ]}>
                  {date.getDate()}
                </Text>
              </View>
              <View
                style={[
                  styles.eventDot,
                  { backgroundColor: theme.primary, opacity: hasEvents ? 1 : 0 },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.scheduleHeader}>
        <Text style={[styles.scheduleDate, { color: theme.text }]}>
          {formatKoreanDate(selectedDate)}
        </Text>
        <Pressable
          testID="calendar-add-button"
          accessibilityRole="button"
          accessibilityLabel="일정 추가"
          onPress={() => setAdding((current) => !current)}
          style={[styles.addButton, { backgroundColor: theme.primarySoft }]}>
          <Plus size={17} color={theme.primary} strokeWidth={2.2} />
        </Pressable>
      </View>

      {adding ? (
        <Card style={styles.addCard}>
          <TextInput
            testID="calendar-event-title-input"
            accessibilityLabel="일정 제목"
            value={newTitle}
            onChangeText={setNewTitle}
            placeholder="일정 제목"
            placeholderTextColor={theme.textTertiary}
            style={[
              styles.input,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text },
            ]}
          />
          <TextInput
            testID="calendar-event-time-input"
            accessibilityLabel="일정 시간"
            value={newTime}
            onChangeText={setNewTime}
            placeholder="시간 (예: 19:00)"
            placeholderTextColor={theme.textTertiary}
            style={[
              styles.input,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text },
            ]}
          />
          <View style={styles.formActions}>
            <ActionButton variant="secondary" onPress={() => setAdding(false)} style={styles.formButton}>
              취소
            </ActionButton>
            <ActionButton
              testID="calendar-event-save-button"
              onPress={saveLocalEvent}
              disabled={!newTitle.trim()}
              style={styles.formButton}>
              추가
            </ActionButton>
          </View>
        </Card>
      ) : null}

      {selectedGeneratedEvents.length === 0 && selectedLocalEvents.length === 0 ? (
        <EmptyState title="일정이 없어요" />
      ) : (
        <>
          {selectedGeneratedEvents.map((event) => (
            <Card key={event.id} style={styles.eventCard}>
              <View style={styles.eventRow}>
                <View style={[styles.eventDotLarge, { backgroundColor: theme.primary }]} />
                <View style={styles.eventText}>
                  <Text style={[styles.eventTitle, { color: theme.text }]}>{event.title}</Text>
                  <Text style={[styles.eventTime, { color: theme.textSecondary }]}>
                    {event.typeLabel}
                  </Text>
                </View>
              </View>
            </Card>
          ))}
          {selectedLocalEvents.map((event) => (
            <Card key={event.id} style={styles.eventCard}>
              <View style={styles.eventRow}>
                <View style={[styles.eventDotLarge, { backgroundColor: theme.primary }]} />
                <View style={styles.eventText}>
                  <Text style={[styles.eventTitle, { color: theme.text }]}>{event.title}</Text>
                  <Text style={[styles.eventTime, { color: theme.textSecondary }]}>{event.time}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${event.title} 삭제`}
                  onPress={() =>
                    setLocalEvents((events) => events.filter((item) => item.id !== event.id))
                  }
                  style={styles.deleteButton}>
                  <Trash2 size={16} color={theme.textTertiary} strokeWidth={2} />
                </Pressable>
              </View>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  monthNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  weekHeader: {
    flexDirection: 'row',
    marginTop: 2,
  },
  weekday: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    minHeight: 44,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 3,
  },
  dayCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: {
    fontSize: 13,
  },
  eventDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  scheduleHeader: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scheduleDate: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  addButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCard: {
    borderRadius: 16,
    padding: 14,
  },
  input: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  formActions: {
    flexDirection: 'row',
    gap: 8,
  },
  formButton: {
    flex: 1,
  },
  eventCard: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eventDotLarge: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  eventText: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  eventTime: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  deleteButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
