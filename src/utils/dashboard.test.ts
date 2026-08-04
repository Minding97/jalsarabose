/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';

import { Chore, HouseholdSnapshot } from '@/domain/types';
import { getChoreSummary } from '@/utils/dashboard';

const baseChore: Omit<Chore, 'id' | 'dueDate' | 'status' | 'assigneeId' | 'score'> = {
  householdId: 'household',
  title: '집안일',
  repeatCycle: 'none',
  createdBy: 'user-a',
  createdAt: '2026-08-01',
  notificationEnabled: true,
};

const snapshot: HouseholdSnapshot = {
  household: {
    id: 'household',
    name: '우리집',
    inviteCode: 'ABC123',
    createdBy: 'user-a',
    createdAt: '2026-08-01',
  },
  members: [
    {
      id: 'member-a',
      householdId: 'household',
      userId: 'user-a',
      name: 'A',
      role: 'admin',
      joinedAt: '2026-08-01',
    },
    {
      id: 'member-b',
      householdId: 'household',
      userId: 'user-b',
      name: 'B',
      role: 'member',
      joinedAt: '2026-08-02',
    },
  ],
  expenses: [],
  fridgeItems: [],
  chores: [
    chore('monday', '2026-08-03', 'done', 'member-a', 2),
    chore('today-done', '2026-08-04', 'done', 'member-a', 3),
    chore('today-pending', '2026-08-04', 'scheduled', 'member-b', 1),
    chore('sunday', '2026-08-09', 'missed', 'member-b', 1),
    chore('next-monday', '2026-08-10', 'scheduled', 'member-a', 1),
    chore('previous-month', '2026-07-31', 'done', 'member-b', 10),
  ],
};

test('calculates today, calendar week, and monthly score independently', () => {
  const summary = getChoreSummary(snapshot, '2026-08-04');

  assert.equal(summary.todayCount, 1);
  assert.equal(summary.todayTotalCount, 2);
  assert.equal(summary.todayCompletedCount, 1);
  assert.equal(summary.todayCompletionPercent, 50);
  assert.equal(summary.weekCount, 4);
  assert.equal(summary.weekCompletedCount, 2);
  assert.equal(summary.completedScore, 5);
  assert.deepEqual(
    summary.contribution.map(({ memberId, completedScore, ratio }) => ({
      memberId,
      completedScore,
      ratio,
    })),
    [
      { memberId: 'member-a', completedScore: 5, ratio: 100 },
      { memberId: 'member-b', completedScore: 0, ratio: 0 },
    ],
  );
});

function chore(
  id: string,
  dueDate: string,
  status: Chore['status'],
  assigneeId: string,
  score: number,
): Chore {
  return { ...baseChore, id, dueDate, status, assigneeId, score };
}
