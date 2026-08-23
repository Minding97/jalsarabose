import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { normalizeNotificationSettings } from '../../src/domain/notification-settings.ts';
import { getReminderCandidates } from '../../src/utils/reminder-policy.ts';

const expense = {
  id: 'expense-rent',
  title: '월세',
  amount: 500_000,
  dueDate: '2026-08-23',
  payerId: 'member-a',
  status: 'scheduled',
  notificationEnabled: true,
};
const fridgeItem = {
  id: 'fridge-milk',
  name: '우유',
  expiryDate: '2026-08-23',
  status: 'stocked',
  notificationEnabled: true,
};
const snapshot = {
  expenses: [
    expense,
    { ...expense, id: 'expense-other', payerId: 'member-b' },
    { ...expense, id: 'expense-paid', status: 'paid' },
  ],
  fridgeItems: [fridgeItem],
};
const recipient = {
  memberId: 'member-a',
  settings: { expenseEnabled: true, fridgeEnabled: true },
};

test('creates only the recipient notifications at 3 days, 1 day, and the due day', () => {
  const candidates = getReminderCandidates(
    snapshot,
    recipient,
    new Date('2026-08-20T08:00:00'),
  );

  assert.equal(candidates.length, 6);
  assert.deepEqual(
    candidates.filter(({ type }) => type === 'expense').map(({ data }) => data.leadDays),
    ['3', '1', '0'],
  );
  assert.ok(candidates.every(({ data }) => data.recipientId === 'member-a'));
  assert.ok(candidates.every(({ id }) => !id.includes('expense-other')));
});

test('drops elapsed reminders and de-duplicates stable item/recipient/lead identifiers', () => {
  const duplicatedSnapshot = {
    ...snapshot,
    expenses: [expense, { ...expense }],
  };
  const candidates = getReminderCandidates(
    duplicatedSnapshot,
    recipient,
    new Date('2026-08-22T10:00:00'),
  );

  assert.equal(candidates.length, 2);
  assert.equal(new Set(candidates.map(({ id }) => id)).size, candidates.length);
  assert.ok(candidates.every(({ data }) => data.leadDays === '0'));
});

test('honors persisted per-category settings and supplies defaults for legacy profiles', () => {
  assert.deepEqual(normalizeNotificationSettings(undefined), {
    expenseEnabled: true,
    fridgeEnabled: true,
  });
  assert.deepEqual(normalizeNotificationSettings({ expenseEnabled: false }), {
    expenseEnabled: false,
    fridgeEnabled: true,
  });

  const candidates = getReminderCandidates(
    snapshot,
    { ...recipient, settings: { expenseEnabled: false, fridgeEnabled: false } },
    new Date('2026-08-20T08:00:00'),
  );
  assert.deepEqual(candidates, []);
});

test('snapshot and settings changes trigger managed reconciliation without global cancellation', () => {
  const store = readFileSync(new URL('../../src/store/household-store.ts', import.meta.url), 'utf8');
  const service = readFileSync(
    new URL('../../src/services/notification-service.ts', import.meta.url),
    'utf8',
  );

  assert.match(store, /subscribeHouseholdSnapshot\([\s\S]*?queueNotificationReconciliation/);
  assert.match(store, /updateNotificationSettings[\s\S]*?saveNotificationSettings/);
  assert.match(service, /getAllScheduledNotificationsAsync/);
  assert.match(service, /HOUSEHOLD_REMINDER_PREFIX/);
  assert.doesNotMatch(service, /cancelAllScheduledNotificationsAsync/);
});
