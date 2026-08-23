import type { FridgeCategory, FridgeStatus, StorageType } from './types';

const fridgeCategories = {
  vegetable: true,
  fruit: true,
  meat: true,
  dairy: true,
  side: true,
  sauce: true,
  other: true,
} satisfies Record<FridgeCategory, true>;

const storageTypes = {
  fridge: true,
  freezer: true,
  room: true,
} satisfies Record<StorageType, true>;

const fridgeStatuses = {
  stocked: true,
  used: true,
  discarded: true,
} satisfies Record<FridgeStatus, true>;

function enumValueOrDefault<T extends string>(
  value: unknown,
  values: Readonly<Record<T, true>>,
  fallback: T,
): T {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(values, value)
    ? (value as T)
    : fallback;
}

export function normalizeFridgeItemEnums(data: {
  category?: unknown;
  storageType?: unknown;
  status?: unknown;
}): {
  category: FridgeCategory;
  storageType: StorageType;
  status: FridgeStatus;
} {
  return {
    category: enumValueOrDefault(data.category, fridgeCategories, 'other'),
    storageType: enumValueOrDefault(data.storageType, storageTypes, 'fridge'),
    status: enumValueOrDefault(data.status, fridgeStatuses, 'stocked'),
  };
}
