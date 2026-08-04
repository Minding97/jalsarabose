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
  members: Pick<HouseholdMember, 'id' | 'joinedAt'>[],
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

export function getNextChoreAssigneeIdFromOrder(
  memberOrder: string[],
  currentAssigneeId: string,
): string {
  if (memberOrder.length === 0) {
    return currentAssigneeId;
  }

  const currentIndex = memberOrder.indexOf(currentAssigneeId);
  return currentIndex < 0
    ? memberOrder[0]
    : memberOrder[(currentIndex + 1) % memberOrder.length];
}

export function createNextChoreOccurrence(
  chore: Chore,
  members: Pick<HouseholdMember, 'id' | 'joinedAt'>[],
  createdAt: ISODate,
): Omit<Chore, 'id'> | null {
  return createNextChoreOccurrenceForAssignee(
    chore,
    getNextChoreAssigneeId(members, chore.assigneeId),
    createdAt,
  );
}

export function createNextChoreOccurrenceForAssignee(
  chore: Chore,
  nextAssigneeId: string,
  createdAt: ISODate,
): Omit<Chore, 'id'> | null {
  const dueDate = getNextChoreDueDate(chore);
  if (!dueDate) {
    return null;
  }

  const { id: _id, repeatAnchorDay: _repeatAnchorDay, ...template } = chore;
  return {
    ...template,
    assigneeId: nextAssigneeId,
    dueDate,
    ...(chore.repeatCycle === 'monthly'
      ? { repeatAnchorDay: chore.repeatAnchorDay ?? fromIsoDate(chore.dueDate).getDate() }
      : {}),
    status: 'scheduled',
    createdAt,
  };
}

export function completeChoreCollection(
  chores: Chore[],
  members: Pick<HouseholdMember, 'id' | 'joinedAt'>[],
  choreId: string,
  createdAt: ISODate,
  createId: () => string,
): Chore[] {
  const chore = chores.find((item) => item.id === choreId);
  if (!chore || chore.status === 'done') {
    return chores;
  }

  const completed = chores.map((item) =>
    item.id === choreId ? { ...item, status: 'done' as const } : item,
  );
  const nextChore = createNextChoreOccurrence(chore, members, createdAt);
  return nextChore ? [...completed, { ...nextChore, id: createId() }] : completed;
}
