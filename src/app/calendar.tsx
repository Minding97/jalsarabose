import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/app/card';
import { ListRow } from '@/components/app/list-row';
import { Screen } from '@/components/app/screen';
import { SegmentedControl } from '@/components/app/segmented-control';
import { StatusPill } from '@/components/app/status-pill';
import { Spacing } from '@/constants/theme';
import { EventType } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';
import { useHouseholdStore } from '@/store/household-store';
import { formatKoreanDate, fromIsoDate, toIsoDate, todayIso } from '@/utils/dates';
import { getCalendarEvents } from '@/utils/dashboard';

const filterOptions = [
  { value: 'all', label: '전체' },
  { value: 'expense', label: '지출' },
  { value: 'chore', label: '집안일' },
  { value: 'fridge', label: '냉장고' },
] as const;

type CalendarFilter = 'all' | EventType;

export default function CalendarScreen() {
  const theme = useTheme();
  const snapshot = useHouseholdStore();
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [filter, setFilter] = useState<CalendarFilter>('all');

  const monthDays = useMemo(() => {
    const selected = fromIsoDate(selectedDate);
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(selected), { weekStartsOn: 0 }),
      end: endOfWeek(endOfMonth(selected), { weekStartsOn: 0 }),
    });
  }, [selectedDate]);

  const allEvents = getCalendarEvents(snapshot);
  const selectedEvents = allEvents.filter((event) => {
    const matchesDate = event.date === selectedDate;
    const matchesFilter = filter === 'all' || event.type === filter;
    return matchesDate && matchesFilter;
  });

  return (
    <Screen
      eyebrow="생활 캘린더"
      title="날짜별 공동 일정"
      description="지출, 집안일, 유통기한을 같은 달력에서 확인해요.">
      <SegmentedControl value={filter} options={[...filterOptions]} onChange={setFilter} />

      <Card title={formatKoreanDate(selectedDate, 'yyyy년 M월')}>
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
            const dayEvents = allEvents.filter((event) => event.date === isoDate);
            const selected = isoDate === selectedDate;
            const inMonth = isSameMonth(date, fromIsoDate(selectedDate));

            return (
              <Pressable
                key={isoDate}
                onPress={() => setSelectedDate(isoDate)}
                style={[
                  styles.dayCell,
                  {
                    backgroundColor: selected ? theme.primarySoft : theme.backgroundElement,
                    borderColor: selected ? theme.primary : theme.border,
                    opacity: inMonth ? 1 : 0.42,
                  },
                ]}>
                <Text style={[styles.dayNumber, { color: theme.text }]}>{date.getDate()}</Text>
                <View style={styles.eventDots}>
                  {dayEvents.slice(0, 3).map((event) => (
                    <View
                      key={event.id}
                      style={[
                        styles.eventDot,
                        {
                          backgroundColor:
                            event.type === 'expense'
                              ? theme.info
                              : event.type === 'chore'
                                ? theme.primary
                                : theme.accent,
                        },
                      ]}
                    />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card title={`${formatKoreanDate(selectedDate)} 일정`}>
        {selectedEvents.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>등록된 일정이 없어요.</Text>
        ) : (
          selectedEvents.map((event) => (
            <ListRow
              key={event.id}
              title={event.title}
              description={event.subtitle}
              right={<StatusPill label={event.typeLabel} tone={event.tone} />}
            />
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  weekHeader: {
    flexDirection: 'row',
    marginBottom: Spacing.two,
  },
  weekday: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '800',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 0,
  },
  dayCell: {
    width: `${100 / 7}%`,
    minHeight: 64,
    borderWidth: 1,
    padding: 8,
  },
  dayNumber: {
    fontSize: 13,
    fontWeight: '800',
  },
  eventDots: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 8,
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
