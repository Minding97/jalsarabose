import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import type { HouseholdSnapshot, NotificationSettings } from '@/domain/types';
import {
  getReminderCandidates,
  HOUSEHOLD_REMINDER_PREFIX,
} from '@/utils/reminder-policy';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const CHANNEL_ID = 'household-reminders';
const RETIRED_NOTIFICATION_PREFIX = 'chore-';
const LEGACY_NOTIFICATION_PREFIXES = ['expense-', 'fridge-'];

export type NotificationSetupResult =
  | {
      status: 'scheduled';
      scheduledCount: number;
      permissionStatus: string;
    }
  | {
      status: 'unsupported';
      scheduledCount: 0;
      permissionStatus: 'unsupported';
      reason: string;
    }
  | {
      status: 'permission-denied';
      scheduledCount: 0;
      permissionStatus: string;
      reason: string;
    };

export async function scheduleHouseholdLocalNotifications(
  snapshot: HouseholdSnapshot,
  recipient: { memberId: string; settings: NotificationSettings },
): Promise<NotificationSetupResult> {
  if (Platform.OS === 'web') {
    return {
      status: 'unsupported',
      scheduledCount: 0,
      permissionStatus: 'unsupported',
      reason: '웹 미리보기에서는 Expo 로컬 알림 예약을 지원하지 않아요.',
    };
  }

  return enqueueReconciliation(async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: '생활 알림',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    await cancelManagedNotifications();
    const candidates = getReminderCandidates(snapshot, recipient);
    if (candidates.length === 0) {
      return {
        status: 'scheduled',
        scheduledCount: 0,
        permissionStatus: 'not-requested',
      };
    }

    const permission = await ensureNotificationPermission();
    if (permission !== 'granted') {
      return {
        status: 'permission-denied',
        scheduledCount: 0,
        permissionStatus: permission,
        reason: '기기 알림 권한이 꺼져 있어요.',
      };
    }

    for (const candidate of candidates) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: candidate.title,
          body: candidate.body,
          data: candidate.data,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: candidate.date,
          channelId: CHANNEL_ID,
        },
        identifier: candidate.id,
      });
    }

    return {
      status: 'scheduled',
      scheduledCount: candidates.length,
      permissionStatus: permission,
    };
  });
}

export async function cancelHouseholdLocalNotifications(): Promise<NotificationSetupResult> {
  if (Platform.OS === 'web') {
    return {
      status: 'unsupported',
      scheduledCount: 0,
      permissionStatus: 'unsupported',
      reason: '웹 미리보기에서는 Expo 로컬 알림 취소를 지원하지 않아요.',
    };
  }

  await enqueueReconciliation(cancelManagedNotifications);

  return {
    status: 'scheduled',
    scheduledCount: 0,
    permissionStatus: 'not-requested',
  };
}

let reconciliationQueue: Promise<unknown> = Promise.resolve();

function enqueueReconciliation<T>(operation: () => Promise<T>): Promise<T> {
  const next = reconciliationQueue.catch(() => undefined).then(operation);
  reconciliationQueue = next;
  return next;
}

async function cancelManagedNotifications() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter(({ identifier }) => isManagedNotification(identifier))
      .map(({ identifier }) => Notifications.cancelScheduledNotificationAsync(identifier)),
  );
}

function isManagedNotification(identifier: string) {
  return (
    identifier.startsWith(HOUSEHOLD_REMINDER_PREFIX) ||
    LEGACY_NOTIFICATION_PREFIXES.some((prefix) => identifier.startsWith(prefix))
  );
}

export async function cancelRetiredFeatureNotifications() {
  if (Platform.OS === 'web') {
    return;
  }

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((notification) => notification.identifier.startsWith(RETIRED_NOTIFICATION_PREFIX))
      .map((notification) =>
        Notifications.cancelScheduledNotificationAsync(notification.identifier),
      ),
  );
}

async function ensureNotificationPermission() {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') {
    return existing.status;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.status;
}
