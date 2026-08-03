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
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import {
  choreFromDoc,
  expenseFromDoc,
  fridgeItemFromDoc,
  householdFromDoc,
  memberFromDoc,
  userProfileFromDoc,
} from '@/services/firestore-mappers';
import { requireAuth, requireDb } from '@/services/firebase';
import {
  Chore,
  Expense,
  FridgeItem,
  Household,
  HouseholdMember,
  HouseholdSnapshot,
  UserProfile,
} from '@/domain/types';
import { todayIso } from '@/utils/dates';
import { createNextChoreOccurrence } from '@/utils/chore-recurrence';

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
  const today = todayIso();

  await runTransaction(db, async (transaction) => {
    const memberRef = doc(db, 'households', householdId, 'members', user.uid);
    const memberSnapshot = await transaction.get(memberRef);

    if (!memberSnapshot.exists()) {
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

export function subscribeHouseholdSnapshot(
  householdId: string,
  callback: (snapshot: HouseholdSnapshot) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const db = requireDb();
  let household: Household | null = null;
  let members: HouseholdMember[] = [];
  let expenses: Expense[] = [];
  let chores: Chore[] = [];
  let fridgeItems: FridgeItem[] = [];

  const emit = () => {
    if (!household) {
      return;
    }

    callback({ household, members, expenses, chores, fridgeItems });
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
      query(collection(db, 'households', householdId, 'expenses'), orderBy('dueDate', 'asc')),
      (snapshot) => {
        expenses = snapshot.docs.map(expenseFromDoc);
        emit();
      },
      onError,
    ),
    onSnapshot(
      query(collection(db, 'households', householdId, 'chores'), orderBy('dueDate', 'asc')),
      (snapshot) => {
        chores = snapshot.docs.map(choreFromDoc);
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

export function addChore(householdId: string, chore: Omit<Chore, 'id'>) {
  return addDoc(
    collection(requireDb(), 'households', householdId, 'chores'),
    omitUndefined(chore),
  );
}

export function updateChore(householdId: string, choreId: string, patch: Partial<Chore>) {
  return updateDoc(
    doc(requireDb(), 'households', householdId, 'chores', choreId),
    replaceUndefinedWithDelete(patch),
  );
}

export async function completeChoreAndScheduleNext(
  householdId: string,
  choreId: string,
  members: HouseholdMember[],
) {
  const db = requireDb();
  const choreRef = doc(db, 'households', householdId, 'chores', choreId);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(choreRef);
    if (!snapshot.exists()) {
      throw new Error('완료할 집안일을 찾을 수 없어요.');
    }

    const chore = choreFromDoc(snapshot);
    if (chore.status === 'done') {
      return { nextScheduled: false };
    }

    transaction.update(choreRef, { status: 'done' });

    const nextChore = createNextChoreOccurrence(chore, members, todayIso());
    if (!nextChore) {
      return { nextScheduled: false };
    }

    const nextChoreRef = doc(collection(db, 'households', householdId, 'chores'));
    transaction.set(nextChoreRef, omitUndefined(nextChore));
    return { nextScheduled: true, nextChoreId: nextChoreRef.id };
  });
}

export function deleteChore(householdId: string, choreId: string) {
  return deleteDoc(doc(requireDb(), 'households', householdId, 'chores', choreId));
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
