import {
  addDays,
  addMonths,
  eachDayOfInterval,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { formatKoreanDate, fromIsoDate, toIsoDate, todayIso } from '@/utils/dates';

type DatePickerFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowClear?: boolean;
  testID?: string;
};

export function DatePickerField({
  label,
  value,
  onChange,
  allowClear = false,
  testID,
}: DatePickerFieldProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => monthForValue(value));

  const monthDays = useMemo(() => {
    const start = startOfWeek(visibleMonth, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end: addDays(start, 41) });
  }, [visibleMonth]);

  const togglePicker = () => {
    if (!open) {
      setVisibleMonth(monthForValue(value));
    }
    setOpen((current) => !current);
  };

  const selectDate = (date: Date) => {
    onChange(toIsoDate(date));
    setOpen(false);
  };

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <View style={styles.fieldRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} 선택`}
          accessibilityHint="캘린더를 열어 날짜를 선택합니다"
          accessibilityState={{ expanded: open }}
          testID={testID}
          onPress={togglePicker}
          style={[
            styles.field,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: open ? theme.primary : theme.border,
            },
          ]}>
          <Text style={[styles.value, { color: value ? theme.text : theme.textTertiary }]}>
            {value ? formatKoreanDate(value, 'yyyy년 M월 d일') : '날짜 선택'}
          </Text>
          <CalendarDays size={19} color={theme.primary} strokeWidth={2} />
        </Pressable>
        {allowClear && value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label} 지우기`}
            testID={testID ? `${testID}-clear` : undefined}
            onPress={() => {
              onChange('');
              setOpen(false);
            }}
            style={[styles.clearButton, { backgroundColor: theme.chip }]}>
            <X size={17} color={theme.textSecondary} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      {open ? (
        <View
          testID={testID ? `${testID}-calendar` : undefined}
          style={[
            styles.calendar,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}>
          <View style={styles.monthNavigation}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="이전 달"
              testID={testID ? `${testID}-previous-month` : undefined}
              onPress={() => setVisibleMonth((current) => addMonths(current, -1))}
              style={styles.monthButton}>
              <ChevronLeft size={19} color={theme.textSecondary} strokeWidth={2} />
            </Pressable>
            <Text style={[styles.monthTitle, { color: theme.text }]}>
              {formatKoreanDate(toIsoDate(visibleMonth), 'yyyy년 M월')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="다음 달"
              testID={testID ? `${testID}-next-month` : undefined}
              onPress={() => setVisibleMonth((current) => addMonths(current, 1))}
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
              const selected = isoDate === value;
              const inMonth = isSameMonth(date, visibleMonth);

              return (
                <Pressable
                  key={isoDate}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatKoreanDate(isoDate)} 선택`}
                  accessibilityState={{ selected }}
                  testID={testID ? `${testID}-day-${isoDate}` : undefined}
                  onPress={() => selectDate(date)}
                  style={styles.dayCell}>
                  <View
                    style={[
                      styles.dayCircle,
                      { backgroundColor: selected ? theme.primary : 'transparent' },
                    ]}>
                    <Text
                      style={[
                        styles.dayNumber,
                        {
                          color: selected ? '#FFFFFF' : theme.text,
                          fontWeight: selected ? '700' : '500',
                          opacity: inMonth || selected ? 1 : 0.35,
                        },
                      ]}>
                      {date.getDate()}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function monthForValue(value: string) {
  const date = value ? fromIsoDate(value) : fromIsoDate(todayIso());
  return startOfMonth(Number.isNaN(date.getTime()) ? new Date() : date);
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 8,
  },
  field: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  value: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  clearButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendar: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 6,
  },
  monthNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  weekHeader: {
    flexDirection: 'row',
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
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: {
    fontSize: 13,
  },
});
