import { DocumentData, QueryDocumentSnapshot, Timestamp } from 'firebase/firestore';

import {
  Expense,
  FridgeItem,
  Household,
  HouseholdMember,
  HouseholdNote,
  HouseholdNoteComment,
  ISODate,
  ISODateTime,
  MonthlyBudget,
  UserProfile,
} from '@/domain/types';
import { toIsoDate } from '@/utils/dates';

type DatedRecord = Record<string, unknown>;

function asIsoDate(value: unknown): ISODate {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Timestamp) {
    return toIsoDate(value.toDate());
  }
  if (value instanceof Date) {
    return toIsoDate(value);
  }
  return toIsoDate(new Date());
}

function asIsoDateTime(value: unknown): ISODateTime {
  if (typeof value === 'string') return value;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date().toISOString();
}

function withIsoDates<T extends DatedRecord>(data: T, fields: string[]) {
  return fields.reduce<DatedRecord>(
    (next, field) => ({
      ...next,
      [field]: asIsoDate(next[field]),
    }),
    data,
  ) as T;
}

export function userProfileFromDoc(doc: QueryDocumentSnapshot<DocumentData>): UserProfile {
  const data = doc.data();

  return {
    uid: doc.id,
    email: data.email ?? '',
    displayName: data.displayName ?? '',
    activeHouseholdId: data.activeHouseholdId,
    createdAt: asIsoDate(data.createdAt),
    updatedAt: asIsoDate(data.updatedAt),
  };
}

export function householdFromDoc(doc: QueryDocumentSnapshot<DocumentData>): Household {
  const data = withIsoDates(doc.data(), ['createdAt']);

  return {
    id: doc.id,
    name: String(data.name ?? ''),
    inviteCode: String(data.inviteCode ?? ''),
    createdBy: String(data.createdBy ?? ''),
    createdAt: data.createdAt as ISODate,
    memberIds: Array.isArray(data.memberIds) ? data.memberIds.map(String) : [],
  };
}

export function memberFromDoc(doc: QueryDocumentSnapshot<DocumentData>): HouseholdMember {
  const data = withIsoDates(doc.data(), ['joinedAt']);

  return {
    id: doc.id,
    householdId: String(data.householdId ?? ''),
    userId: String(data.userId ?? doc.id),
    name: String(data.name ?? ''),
    role: data.role === 'admin' ? 'admin' : 'member',
    joinedAt: data.joinedAt as ISODate,
  };
}

export function expenseFromDoc(doc: QueryDocumentSnapshot<DocumentData>): Expense {
  const data = withIsoDates(doc.data(), ['dueDate', 'createdAt']);

  return {
    id: doc.id,
    householdId: String(data.householdId ?? ''),
    title: String(data.title ?? ''),
    category: (data.category as Expense['category']) ?? 'other',
    amount: Number(data.amount ?? 0),
    dueDate: data.dueDate as ISODate,
    paymentMethod: data.paymentMethod ? String(data.paymentMethod) : undefined,
    payerId: data.payerId ? String(data.payerId) : undefined,
    splitRatio: data.splitRatio as Expense['splitRatio'],
    isRecurring: Boolean(data.isRecurring),
    status: (data.status as Expense['status']) ?? 'scheduled',
    memo: data.memo ? String(data.memo) : undefined,
    createdBy: String(data.createdBy ?? ''),
    createdAt: data.createdAt as ISODate,
    notificationEnabled: data.notificationEnabled !== false,
  };
}

export function monthlyBudgetFromDoc(
  doc: QueryDocumentSnapshot<DocumentData>,
): MonthlyBudget {
  const data = withIsoDates(doc.data(), ['createdAt', 'updatedAt']);
  const rawContributions =
    data.memberContributions && typeof data.memberContributions === 'object'
      ? (data.memberContributions as Record<string, unknown>)
      : {};

  return {
    id: doc.id,
    householdId: String(data.householdId ?? ''),
    month: String(data.month ?? doc.id),
    totalAmount: Number(data.totalAmount ?? 0),
    contributionMode: data.contributionMode === 'custom' ? 'custom' : 'equal',
    memberContributions: Object.fromEntries(
      Object.entries(rawContributions).map(([memberId, amount]) => [memberId, Number(amount)]),
    ),
    createdBy: String(data.createdBy ?? ''),
    createdAt: data.createdAt as ISODate,
    updatedBy: String(data.updatedBy ?? data.createdBy ?? ''),
    updatedAt: data.updatedAt as ISODate,
    revision:
      typeof data.revision === 'number' && Number.isInteger(data.revision) && data.revision > 0
        ? data.revision
        : 1,
  };
}
export function fridgeItemFromDoc(doc: QueryDocumentSnapshot<DocumentData>): FridgeItem {
  const data = withIsoDates(doc.data(), ['createdAt']);
  const expiryDate = data.expiryDate ? asIsoDate(data.expiryDate) : undefined;

  return {
    id: doc.id,
    householdId: String(data.householdId ?? ''),
    name: String(data.name ?? ''),
    category: (data.category as FridgeItem['category']) ?? 'other',
    quantity: data.quantity ? String(data.quantity) : undefined,
    storageType: (data.storageType as FridgeItem['storageType']) ?? 'fridge',
    expiryDate,
    status: (data.status as FridgeItem['status']) ?? 'stocked',
    memo: data.memo ? String(data.memo) : undefined,
    createdBy: String(data.createdBy ?? ''),
    createdAt: data.createdAt as ISODate,
    notificationEnabled: data.notificationEnabled !== false,
  };
}

export function householdNoteFromDoc(
  doc: QueryDocumentSnapshot<DocumentData>,
): HouseholdNote {
  const data = doc.data();
  return {
    id: doc.id,
    householdId: String(data.householdId ?? ''),
    type: data.type === 'shopping' ? 'shopping' : 'memo',
    title: String(data.title ?? ''),
    memo: data.memo ? String(data.memo) : undefined,
    status: data.status === 'completed' ? 'completed' : 'active',
    createdBy: String(data.createdBy ?? ''),
    createdAt: asIsoDateTime(data.createdAt),
    updatedBy: String(data.updatedBy ?? data.createdBy ?? ''),
    updatedAt: asIsoDateTime(data.updatedAt ?? data.createdAt),
  };
}

export function householdNoteCommentFromDoc(
  doc: QueryDocumentSnapshot<DocumentData>,
): HouseholdNoteComment {
  const data = doc.data();
  return {
    id: doc.id,
    householdId: String(data.householdId ?? ''),
    noteId: String(data.noteId ?? ''),
    content: String(data.content ?? ''),
    createdBy: String(data.createdBy ?? ''),
    createdAt: asIsoDateTime(data.createdAt),
  };
}
