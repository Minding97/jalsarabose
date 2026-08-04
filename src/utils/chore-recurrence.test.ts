import assert from 'node:assert/strict';
import test from 'node:test';

import { Chore, HouseholdMember } from '@/domain/types';
import {
  createNextChoreOccurrence,
  getNextChoreAssigneeId,
  getNextChoreDueDate,
} from '@/utils/chore-recurrence';

const members: HouseholdMember[] = [
  {
    id: 'member-a',
    householdId: 'household',
    userId: 'user-a',
    name: 'A',
    role: 'admin',
    joinedAt: '2026-01-01',
  },
  {
    id: 'member-b',
    householdId: 'household',
    userId: 'user-b',
    name: 'B',
    role: 'member',
    joinedAt: '2026-01-02',
  },
];

test('calculates every supported repeat cycle', () => {
  assert.equal(getNextChoreDueDate({ dueDate: '2026-08-04', repeatCycle: 'none' }), null);
  assert.equal(getNextChoreDueDate({ dueDate: '2026-08-04', repeatCycle: 'daily' }), '2026-08-05');
  assert.equal(getNextChoreDueDate({ dueDate: '2026-08-04', repeatCycle: 'weekly' }), '2026-08-11');
  assert.equal(
    getNextChoreDueDate({ dueDate: '2026-08-04', repeatCycle: 'biweekly' }),
    '2026-08-18',
  );
});

test('preserves the monthly anchor after a short month', () => {
  const february = getNextChoreDueDate({
    dueDate: '2024-01-31',
    repeatCycle: 'monthly',
    repeatAnchorDay: 31,
  });
  assert.equal(february, '2024-02-29');
  assert.equal(
    getNextChoreDueDate({
      dueDate: february!,
      repeatCycle: 'monthly',
      repeatAnchorDay: 31,
    }),
    '2024-03-31',
  );
});

test('rotates by join order with defined fallbacks', () => {
  assert.equal(getNextChoreAssigneeId(members, 'member-a'), 'member-b');
  assert.equal(getNextChoreAssigneeId(members, 'member-b'), 'member-a');
  assert.equal(getNextChoreAssigneeId(members, 'member-left'), 'member-a');
  assert.equal(getNextChoreAssigneeId([members[0]], 'member-a'), 'member-a');
  assert.equal(getNextChoreAssigneeId([], 'member-left'), 'member-left');
});

test('creates a scheduled next occurrence without mutating the source', () => {
  const chore: Chore = {
    id: 'chore',
    householdId: 'household',
    title: '청소',
    assigneeId: 'member-a',
    dueDate: '2026-08-04',
    repeatCycle: 'weekly',
    score: 3,
    status: 'done',
    createdBy: 'user-a',
    createdAt: '2026-08-04',
    notificationEnabled: true,
  };

  const next = createNextChoreOccurrence(chore, members, '2026-08-05');
  assert.equal(next?.dueDate, '2026-08-11');
  assert.equal(next?.assigneeId, 'member-b');
  assert.equal(next?.status, 'scheduled');
  assert.equal(chore.dueDate, '2026-08-04');
});
