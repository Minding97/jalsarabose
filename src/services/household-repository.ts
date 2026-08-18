import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  Unsubscribe,
  addDoc,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import {
  expenseFromDoc,
  fridgeItemFromDoc,
  householdFromDoc,
  memberFromDoc,
  monthlyBudgetFromDoc,
  userProfileFromDoc,
} from '@/services/firestore-mappers';
import { requireAuth, requireDb } from '@/services/firebase';
import {
  Expense,
  FridgeItem,
  Household,
  HouseholdMember,
  HouseholdSnapshot,
  MonthlyBudget,
  UserProfile,
} from '@/domain/types';
import { todayIso } from '@/utils/dates';
import { saveMonthlyBudgetWithRevision } from '@/services/monthly-budget-write';

type ProfilePatch = Partial<Pick<UserProfile, 'activeHouseholdId' | 'displayName'>>;
type CreateHouseholdInput = {
  name: string;
  owner: UserProfile;
};

export function subscribeAuth(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(requireAuth(), callback);
}

export async function signIn(email: string, password: string) {
  return signInWithEmailAndPassword(requireAuth(), email.trim(), password);
}

export async function signUp(email: string, password: string, displayName: string) {
  const credential = await createUserWithEmailAndPassword(requireAuth(), email.trim(), password);
  await upsertUserProfile(credential.user, {
    displayName: displayName.trim() || (credential.user.email ?? ''),
  });
  return credential;
}

export function signOutCurrentUser() {
  return signOut(requireAuth());
}

export async function upsertUserProfile(user: User, patch: ProfilePatch = {}) {
  const today = todayIso();
  const userRef = doc(requireDb(), 'users', user.uid);
  const existing = await getDoc(userRef);
  const data: Record<string, string | null> = {
    uid: user.uid,
    email: user.email ?? '',
    updatedAt: today,
  };

  if (!existing.exists()) {
    data.displayName = patch.displayName ?? user.email ?? '';
    data.activeHouseholdId = patch.activeHouseholdId ?? null;
    data.createdAt = today;
  }

  if (patch.displayName !== undefined) {
    data.displayName = patch.displayName;
  }

  if (patch.activeHouseholdId !== undefined) {
    data.activeHouseholdId = patch.activeHouseholdId ?? null;
  }

  await setDoc(userRef, data, { merge: true });
}

export function subscribeUserProfile(uid: string, callback: (profile: UserProfile | null) => void) {
  return onSnapshot(doc(requireDb(), 'users', uid), (snapshot) => {
    callback(snapshot.exists() ? userProfileFromDoc(snapshot) : null);
  });
}

export async function createHousehold({ name, owner }: CreateHouseholdInput) {
  const db = requireDb();
  const householdRef = doc(collection(db, 'households'));
  const inviteCode = createInviteCode();
  const today = todayIso();

  await runTransaction(db, async (transaction) => {
    const inviteRef = doc(db, 'inviteCodes', inviteCode);
    const inviteSnapshot = await transaction.get(inviteRef);

    if (inviteSnapshot.exists()) {
      throw new Error('초대 코드 생성이 충돌했어요. 다시 시도해주세요.');
    }

    transaction.set(householdRef, {
      name: name.trim(),
      inviteCode,
      createdBy: owner.uid,
      createdAt: today,
      memberIds: [owner.uid],
    });
    transaction.set(doc(db, 'households', householdRef.id, 'members', owner.uid), {
      householdId: householdRef.id,
      userId: owner.uid,
      name: owner.displayName || owner.email,
      role: 'admin',
      joinedAt: today,
      inviteCode,
    });
    transaction.set(inviteRef, {
      code: inviteCode,
      householdId: householdRef.id,
      createdBy: owner.uid,
      createdAt: today,
    });
    transaction.set(
      doc(db, 'users', owner.uid),
      {
        activeHouseholdId: householdRef.id,
        updatedAt: today,
      },
      { merge: true },
    );
  });

  return householdRef.id;
}

export async function joinHouseholdByInviteCode(code: string, user: UserProfile) {
  const db = requireDb();
  const normalizedCode = code.trim().toUpperCase();
  const inviteRef = doc(db, 'inviteCodes', normalizedCode);
  const inviteSnapshot = await getDoc(inviteRef);

  if (!inviteSnapshot.exists()) {
    throw new Error('초대 코드를 찾을 수 없어요.');
  }

  const householdId = String(inviteSnapshot.data().householdId ?? '');
  const creatorId = String(inviteSnapshot.data().createdBy ?? '');
  const today = todayIso();

  await runTransaction(db, async (transaction) => {
    const householdRef = doc(db, 'households', householdId);
    const memberRef = doc(db, 'households', householdId, 'members', user.uid);
    const memberSnapshot = await transaction.get(memberRef);

    if (!memberSnapshot.exists()) {
      transaction.update(householdRef, { memberIds: [creatorId, user.uid] });
      transaction.set(memberRef, {
        householdId,
        userId: user.uid,
        name: user.displayName || user.email,
        role: 'member',
        joinedAt: today,
        inviteCode: normalizedCode,
      });
    }

    transaction.set(
      doc(db, 'users', user.uid),
      {
        activeHouseholdId: householdId,
        updatedAt: today,
      },
      { merge: true },
    );
  });

  return householdId;
}

export async function migrateLegacyHouseholdMemberIndex(householdId: string, uid: string) {
  const db = requireDb();
  const householdRef = doc(db, 'households', householdId);
  const householdSnapshot = await getDoc(householdRef);

  if (!householdSnapshot.exists() || Array.isArray(householdSnapshot.data().memberIds)) return;
  if (String(householdSnapshot.data().createdBy ?? '') !== uid) return;

  const membersSnapshot = await getDocs(collection(db, 'households', householdId, 'members'));
  const memberIds = membersSnapshot.docs.map((member) => member.id);
  const orderedMemberIds = [uid, ...memberIds.filter((memberId) => memberId !== uid).sort()];
  if (orderedMemberIds.length < 1 || orderedMemberIds.length > 2) {
    throw new Error('기존 가구의 구성원 정보를 안전하게 전환할 수 없어요.');
  }
  await updateDoc(householdRef, { memberIds: orderedMemberIds });
}

export function subscribeHouseholdSnapshot(
  householdId: string,
  callback: (snapshot: HouseholdSnapshot) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const db = requireDb();
  let household: Household | null = null;
  let members: HouseholdMember[] = [];
  let monthlyBudgets: MonthlyBudget[] = [];
  let expenses: Expense[] = [];
  let fridgeItems: FridgeItem[] = [];

  const emit = () => {
    if (!household) {
      return;
    }

    const effectiveMemberIds = household.memberIds.length
      ? household.memberIds
      : [
          household.createdBy,
          ...members
            .filter((member) => member.id !== household?.createdBy)
            .map((member) => member.id),
        ];
    const memberOrder = new Map(effectiveMemberIds.map((memberId, index) => [memberId, index]));
    const orderedMembers = [...members].sort((left, right) => {
      const leftIndex = memberOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = memberOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex || left.id.localeCompare(right.id);
    });

    callback({ household, members: orderedMembers, monthlyBudgets, expenses, fridgeItems });
  };

  const unsubs = [
    onSnapshot(
      doc(db, 'households', householdId),
      (snapshot) => {
        if (!snapshot.exists()) {
          onError(new Error('가구 정보를 찾을 수 없어요.'));
          return;
        }
        household = householdFromDoc(snapshot);
        emit();
      },
      onError,
    ),
    onSnapshot(
      collection(db, 'households', householdId, 'members'),
      (snapshot) => {
        members = snapshot.docs.map(memberFromDoc);
        emit();
      },
      onError,
    ),
    onSnapshot(
      query(collection(db, 'households', householdId, 'monthlyBudgets'), orderBy('month', 'desc')),
      (snapshot) => {
        monthlyBudgets = snapshot.docs.map(monthlyBudgetFromDoc);
        emit();
      },
      onError,
    ),
    onSnapshot(
      query(collection(db, 'households', householdId, 'expenses'), orderBy('dueDate', 'asc')),
      (snapshot) => {
        expenses = snapshot.docs.map(expenseFromDoc);
        emit();
      },
      onError,
    ),
    onSnapshot(
      query(collection(db, 'households', householdId, 'fridgeItems'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        fridgeItems = snapshot.docs.map(fridgeItemFromDoc);
        emit();
      },
      onError,
    ),
  ];

  return () => unsubs.forEach((unsubscribe) => unsubscribe());
}

export async function saveMonthlyBudget(
  householdId: string,
  budget: Omit<MonthlyBudget, 'id' | 'revision'>,
  expectedRevision: number,
) {
  await saveMonthlyBudgetWithRevision(requireDb(), householdId, omitUndefined(budget), expectedRevision);
}

export function addExpense(householdId: string, expense: Omit<Expense, 'id'>) {
  return addDoc(
    collection(requireDb(), 'households', householdId, 'expenses'),
    omitUndefined(expense),
  );
}

export function updateExpense(householdId: string, expenseId: string, patch: Partial<Expense>) {
  return updateDoc(
    doc(requireDb(), 'households', householdId, 'expenses', expenseId),
    replaceUndefinedWithDelete(patch),
  );
}

export function deleteExpense(householdId: string, expenseId: string) {
  return deleteDoc(doc(requireDb(), 'households', householdId, 'expenses', expenseId));
}

export function addFridgeItem(householdId: string, item: Omit<FridgeItem, 'id'>) {
  return addDoc(
    collection(requireDb(), 'households', householdId, 'fridgeItems'),
    omitUndefined(item),
  );
}

export function updateFridgeItem(householdId: string, itemId: string, patch: Partial<FridgeItem>) {
  return updateDoc(
    doc(requireDb(), 'households', householdId, 'fridgeItems', itemId),
    replaceUndefinedWithDelete(patch),
  );
}

export function deleteFridgeItem(householdId: string, itemId: string) {
  return deleteDoc(doc(requireDb(), 'households', householdId, 'fridgeItems', itemId));
}

function createInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function omitUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  ) as T;
}

function replaceUndefinedWithDelete(value: object) {
  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => [
      key,
      fieldValue === undefined ? deleteField() : fieldValue,
    ]),
  );
}
