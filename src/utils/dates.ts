import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

import { ISODate } from '@/domain/types';

export function toIsoDate(date: Date): ISODate {
  return format(date, 'yyyy-MM-dd');
}

export function todayIso(): ISODate {
  return toIsoDate(new Date());
}

export function fromIsoDate(date: ISODate): Date {
  return parseISO(`${date}T00:00:00`);
}

export function formatKoreanDate(date: ISODate, pattern = 'M월 d일 EEEE'): string {
  return format(fromIsoDate(date), pattern, { locale: ko });
}

export function daysUntil(date: ISODate, baseDate: ISODate): number {
  return differenceInCalendarDays(fromIsoDate(date), fromIsoDate(baseDate));
}
