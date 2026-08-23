import type { NotificationSettings } from './types';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  expenseEnabled: true,
  fridgeEnabled: true,
};

export function normalizeNotificationSettings(value: unknown): NotificationSettings {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }

  const settings = value as Partial<NotificationSettings>;
  return {
    expenseEnabled:
      typeof settings.expenseEnabled === 'boolean'
        ? settings.expenseEnabled
        : DEFAULT_NOTIFICATION_SETTINGS.expenseEnabled,
    fridgeEnabled:
      typeof settings.fridgeEnabled === 'boolean'
        ? settings.fridgeEnabled
        : DEFAULT_NOTIFICATION_SETTINGS.fridgeEnabled,
  };
}
