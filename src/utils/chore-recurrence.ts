import { addDays, addMonths, getDaysInMonth, setDate, startOfMonth } from 'date-fns';

import { Chore, HouseholdMember, ISODate } from '@/domain/types';
import { fromIsoDate, toIsoDate } from '@/utils/dates';

const repeatDayOffsets: Partial<Record<Chore['repeatCycle'], number>> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
};

export function getNextChoreDueDate(
  chore: Pick<Chore, 'dueDate' | 'repeatCycle' | 'repeatAnchorDay'>,
): ISODate | null {
  if (chore.repeatCycle === 'none') {
    return null;
  }

  const currentDueDate = fromIsoDate(chore.dueDate);
  if (chore.repeatCycle === 'monthly') {
    const nextMonth = startOfMonth(addMonths(currentDueDate, 1));
    const anchorDay = Math.min(Math.max(chore.repeatAnchorDay ?? currentDueDate.getDate(), 1), 31);
    return toIsoDate(setDate(nextMonth, Math.min(anchorDay, getDaysInMonth(nextMonth))));
  }

  return toIsoDate(addDays(currentDueDate, repeatDayOffsets[chore.repeatCycle] ?? 0));
}

export function getNextChoreAssigneeId(
  members: HouseholdMember[],
  currentAssigneeId: string,
): string {
  const orderedMembers = [...members].sort(
    (left, right) => left.joinedAt.localeCompare(right.joinedAt) || left.id.localeCompare(right.id),
  );
  if (orderedMembers.length === 0) {
    return currentAssigneeId;
  }

  const currentIndex = orderedMembers.findIndex((member) => member.id === currentAssigneeId);
  if (currentIndex < 0) {
    return orderedMembers[0].id;
  }

  return orderedMembers[(currentIndex + 1) % orderedMembers.length].id;
}

export function createNextChoreOccurrence(
  chore: Chore,
  members: HouseholdMember[],
  createdAt: ISODate,
): Omit<Chore, 'id'> | null {
  const dueDate = getNextChoreDueDate(chore);
  if (!dueDate) {
    return null;
  }

  const { id: _id, ...template } = chore;
  return {
    ...template,
    assigneeId: getNextChoreAssigneeId(members, chore.assigneeId),
    dueDate,
    repeatAnchorDay:
      chore.repeatCycle === 'monthly'
        ? (chore.repeatAnchorDay ?? fromIsoDate(chore.dueDate).getDate())
        : undefined,
    status: 'scheduled',
    createdAt,
  };
}
