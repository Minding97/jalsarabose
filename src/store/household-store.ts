import { User } from 'firebase/auth';
import { Unsubscribe } from 'firebase/firestore';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { createSeedState } from '@/data/seed';
import {
  Expense,
  ExpenseInput,
  ExpenseStatus,
  FridgeItem,
  FridgeItemInput,
  FridgeStatus,
  HouseholdSnapshot,
  MonthlyBudget,
  MonthlyBudgetInput,
  UserProfile,
} from '@/domain/types';
import { validateMonthlyBudgetInput } from '@/domain/monthly-budget';
import { getSignInErrorMessage, getSignUpErrorMessage } from '@/domain/auth-errors';
import {
  addExpense,
  addFridgeItem,
  createHousehold,
  deleteExpense,
  deleteFridgeItem,
  joinHouseholdByInviteCode,
  migrateLegacyHouseholdMemberIndex,
  saveMonthlyBudget,
  signIn,
  signOutCurrentUser,
  signUp,
  subscribeAuth,
  subscribeHouseholdSnapshot,
  subscribeUserProfile,
  updateExpense,
  updateFridgeItem,
  upsertUserProfile,
} from '@/services/household-repository';
import { firebaseConfigIssues, isFirebaseConfigured, useMocks } from '@/services/firebase';
import { todayIso } from '@/utils/dates';

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated' | 'mock' | 'missing-config';
type DataStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';
type NotificationStatus = 'idle' | 'scheduling' | 'scheduled' | 'unsupported' | 'permission-denied' | 'error';

type HouseholdActions = {
  authStatus: AuthStatus;
  dataStatus: DataStatus;
  notificationStatus: NotificationStatus;
  scheduledNotificationCount: number;
  notificationMessage: string | null;
  currentUser: UserProfile | null;
  activeHouseholdId: string | null;
  errorMessage: string | null;
  configIssues: string[];
  initializeSession: () => Unsubscribe;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  createNewHousehold: (name: string) => Promise<void>;
  joinHousehold: (code: string) => Promise<void>;
  saveMonthlyBudgetItem: (input: MonthlyBudgetInput) => Promise<void>;
  addExpenseItem: (input: ExpenseInput) => Promise<void>;
  updateExpenseItem: (expenseId: string, input: ExpenseInput) => Promise<void>;
  deleteExpenseItem: (expenseId: string) => Promise<void>;
  markExpensePaid: (expenseId: string) => Promise<void>;
  updateExpenseStatus: (expenseId: string, status: ExpenseStatus) => Promise<void>;
  updateFridgeItemStatus: (itemId: string, status: FridgeStatus) => Promise<void>;
  addFridgeItemEntry: (input: FridgeItemInput) => Promise<void>;
  updateFridgeItemEntry: (itemId: string, input: FridgeItemInput) => Promise<void>;
  deleteFridgeItemEntry: (itemId: string) => Promise<void>;
  scheduleNotifications: () => Promise<void>;
  cancelNotifications: () => Promise<void>;
};

type StoreState = HouseholdSnapshot & HouseholdActions;

const seedState = createSeedState();
const emptySnapshot: HouseholdSnapshot = {
  household: {
    id: '',
    name: '',
    inviteCode: '',
    createdBy: '',
    createdAt: todayIso(),
    memberIds: [],
  },
  members: [],
  monthlyBudgets: [],
  expenses: [],
  fridgeItems: [],
};

export const useHouseholdStore = create<StoreState>((set, get) => ({
  ...(useMocks ? seedState : emptySnapshot),
  authStatus: useMocks ? 'mock' : 'checking',
  dataStatus: useMocks ? 'ready' : 'idle',
  notificationStatus: 'idle',
  scheduledNotificationCount: 0,
  notificationMessage: null,
  currentUser: useMocks
    ? {
        uid: 'mock-user',
        email: 'mock@jalsarabose.local',
        displayName: '민서',
        activeHouseholdId: seedState.household.id,
        createdAt: todayIso(),
        updatedAt: todayIso(),
      }
    : null,
  activeHouseholdId: useMocks ? seedState.household.id : null,
  errorMessage: null,
  configIssues: firebaseConfigIssues,

  initializeSession: () => {
    if (useMocks) {
      set({
        ...createSeedState(),
        authStatus: 'mock',
        dataStatus: 'ready',
        errorMessage: null,
      });
      return () => undefined;
    }

    if (!isFirebaseConfigured) {
      set({
        ...emptySnapshot,
        authStatus: 'missing-config',
        dataStatus: 'idle',
        errorMessage: 'Firebase 환경변수가 설정되지 않았어요.',
        configIssues: firebaseConfigIssues,
      });
      return () => undefined;
    }

    let unsubscribeProfile: Unsubscribe | undefined;
    let unsubscribeHousehold: Unsubscribe | undefined;

    const cleanupNested = () => {
      unsubscribeProfile?.();
      unsubscribeHousehold?.();
      unsubscribeProfile = undefined;
      unsubscribeHousehold = undefined;
    };

    const unsubscribeAuth = subscribeAuth(async (user: User | null) => {
      cleanupNested();

      if (!user) {
        set({
          ...emptySnapshot,
          authStatus: 'unauthenticated',
          dataStatus: 'idle',
          currentUser: null,
          activeHouseholdId: null,
          errorMessage: null,
        });
        return;
      }

      set({ authStatus: 'authenticated', dataStatus: 'loading', errorMessage: null });
      await upsertUserProfile(user);

      unsubscribeProfile = subscribeUserProfile(user.uid, (profile) => {
        if (!profile) {
          set({
            currentUser: null,
            activeHouseholdId: null,
            dataStatus: 'empty',
          });
          return;
        }

        set({
          currentUser: profile,
          activeHouseholdId: profile.activeHouseholdId ?? null,
          dataStatus: profile.activeHouseholdId ? 'loading' : 'empty',
        });

        unsubscribeHousehold?.();
        unsubscribeHousehold = undefined;

        if (!profile.activeHouseholdId) {
          set({ ...emptySnapshot, currentUser: profile, dataStatus: 'empty' });
          return;
        }

        void migrateLegacyHouseholdMemberIndex(profile.activeHouseholdId, user.uid).catch(() => {
          // A non-admin legacy member can still rejoin and read; the admin performs migration.
        });

        unsubscribeHousehold = subscribeHouseholdSnapshot(
          profile.activeHouseholdId,
          (snapshot) => set({ ...snapshot, dataStatus: 'ready', errorMessage: null }),
          (error) => set({ dataStatus: 'error', errorMessage: error.message }),
        );
      });
    });

    return () => {
      cleanupNested();
      unsubscribeAuth();
    };
  },

  signInWithEmail: async (email, password) => {
    set({ errorMessage: null });
    try {
      await signIn(email, password);
    } catch (error) {
      set({ errorMessage: getSignInErrorMessage(error) });
      throw error;
    }
  },

  signUpWithEmail: async (email, password, displayName) => {
    set({ errorMessage: null });
    try {
      await signUp(email, password, displayName);
    } catch (error) {
      set({ errorMessage: getSignUpErrorMessage(error) });
      throw error;
    }
  },

  signOut: async () => {
    if (useMocks) {
      return;
    }
    await signOutCurrentUser();
  },

  createNewHousehold: async (name) => {
    const user = requireCurrentUser(get());

    if (useMocks) {
      set((state) => ({
        household: {
          ...state.household,
          name: name.trim(),
        },
      }));
      return;
    }

    try {
      await createHousehold({ name, owner: user });
    } catch (error) {
      set({ errorMessage: getErrorMessage(error) });
      throw error;
    }
  },

  joinHousehold: async (code) => {
    const user = requireCurrentUser(get());

    if (useMocks) {
      set({ errorMessage: 'Mock 모드에서는 초대 코드 참여를 시뮬레이션하지 않아요.' });
      return;
    }

    try {
      await joinHouseholdByInviteCode(code, user);
    } catch (error) {
      set({ errorMessage: getErrorMessage(error) });
      throw error;
    }
  },

  saveMonthlyBudgetItem: async (input) => {
    const state = get();
    const validationMessage = validateMonthlyBudgetInput(input, state.members);

    if (validationMessage) {
      throw new Error(validationMessage);
    }

    const budget = createMonthlyBudgetPayload(state, input);
    if (useMocks) {
      set((current) => ({
        monthlyBudgets: [
          ...current.monthlyBudgets.filter((item) => item.month !== input.month),
          {
            ...budget,
            id: input.month,
            revision:
              (current.monthlyBudgets.find((item) => item.month === input.month)?.revision ?? 0) + 1,
          },
        ].sort((a, b) => b.month.localeCompare(a.month)),
      }));
      return;
    }

    try {
      const existing = state.monthlyBudgets.find((item) => item.month === input.month);
      await saveMonthlyBudget(requireHouseholdId(state), budget, existing?.revision ?? 0);
    } catch (error) {
      set({ errorMessage: getErrorMessage(error) });
      throw error;
    }
  },

  addExpenseItem: async (input) => {
    const state = get();
    const expense = createExpensePayload(state, input);

    if (useMocks) {
      set((current) => ({
        expenses: [...current.expenses, { ...expense, id: createLocalId('expense') }],
      }));
      return;
    }

    await addExpense(requireHouseholdId(state), expense);
  },

  updateExpenseItem: async (expenseId, input) => {
    const state = get();

    if (useMocks) {
      set((current) => ({
        expenses: current.expenses.map((expense) =>
          expense.id === expenseId ? { ...expense, ...input } : expense,
        ),
      }));
      return;
    }

    await updateExpense(requireHouseholdId(state), expenseId, input);
  },

  deleteExpenseItem: async (expenseId) => {
    const state = get();

    if (useMocks) {
      set((current) => ({
        expenses: current.expenses.filter((expense) => expense.id !== expenseId),
      }));
      return;
    }

    await deleteExpense(requireHouseholdId(state), expenseId);
  },

  markExpensePaid: async (expenseId) => {
    await get().updateExpenseStatus(expenseId, 'paid');
  },

  updateExpenseStatus: async (expenseId, status) => {
    const state = get();

    if (useMocks) {
      set((current) => ({
        expenses: current.expenses.map((expense) =>
          expense.id === expenseId ? { ...expense, status } : expense,
        ),
      }));
      return;
    }

    await updateExpense(requireHouseholdId(state), expenseId, { status });
  },

  addFridgeItemEntry: async (input) => {
    const state = get();
    const item = createFridgePayload(state, input);

    if (useMocks) {
      set((current) => ({
        fridgeItems: [{ ...item, id: createLocalId('fridge') }, ...current.fridgeItems],
      }));
      return;
    }

    await addFridgeItem(requireHouseholdId(state), item);
  },

  updateFridgeItemEntry: async (itemId, input) => {
    const state = get();

    if (useMocks) {
      set((current) => ({
        fridgeItems: current.fridgeItems.map((item) =>
          item.id === itemId ? { ...item, ...input } : item,
        ),
      }));
      return;
    }

    await updateFridgeItem(requireHouseholdId(state), itemId, input);
  },

  deleteFridgeItemEntry: async (itemId) => {
    const state = get();

    if (useMocks) {
      set((current) => ({
        fridgeItems: current.fridgeItems.filter((item) => item.id !== itemId),
      }));
      return;
    }

    await deleteFridgeItem(requireHouseholdId(state), itemId);
  },

  updateFridgeItemStatus: async (itemId, status) => {
    const state = get();

    if (useMocks) {
      set((current) => ({
        fridgeItems: current.fridgeItems.map((item) => (item.id === itemId ? { ...item, status } : item)),
      }));
      return;
    }

    await updateFridgeItem(requireHouseholdId(state), itemId, { status });
  },

  scheduleNotifications: async () => {
    const state = get();

    set({
      notificationStatus: 'scheduling',
      notificationMessage: null,
      scheduledNotificationCount: 0,
    });

    try {
      if (Platform.OS === 'web') {
        set({
          notificationStatus: 'unsupported',
          scheduledNotificationCount: 0,
          notificationMessage: '웹 미리보기에서는 Expo 로컬 알림 예약을 지원하지 않아요.',
        });
        return;
      }

      const { scheduleHouseholdLocalNotifications } = await import('@/services/notification-service');
      const result = await scheduleHouseholdLocalNotifications(state);

      set({
        notificationStatus: result.status,
        scheduledNotificationCount: result.scheduledCount,
        notificationMessage:
          result.status === 'scheduled'
            ? `${result.scheduledCount}개 알림을 예약했어요.`
            : result.reason,
      });
    } catch (error) {
      set({
        notificationStatus: 'error',
        scheduledNotificationCount: 0,
        notificationMessage: getErrorMessage(error),
      });
      throw error;
    }
  },

  cancelNotifications: async () => {
    set({
      notificationStatus: 'scheduling',
      notificationMessage: null,
    });

    try {
      if (Platform.OS === 'web') {
        set({
          notificationStatus: 'unsupported',
          scheduledNotificationCount: 0,
          notificationMessage: '웹 미리보기에서는 Expo 로컬 알림 취소를 지원하지 않아요.',
        });
        return;
      }

      const { cancelHouseholdLocalNotifications } = await import('@/services/notification-service');
      await cancelHouseholdLocalNotifications();

      set({
        notificationStatus: 'idle',
        scheduledNotificationCount: 0,
        notificationMessage: '예약된 로컬 알림을 모두 취소했어요.',
      });
    } catch (error) {
      set({
        notificationStatus: 'error',
        notificationMessage: getErrorMessage(error),
      });
      throw error;
    }
  },
}));

function createExpensePayload(state: StoreState, input: ExpenseInput): Omit<Expense, 'id'> {
  const user = requireCurrentUser(state);

  return {
    ...input,
    householdId: requireHouseholdId(state),
    createdBy: user.uid,
    createdAt: todayIso(),
  };
}

function createMonthlyBudgetPayload(
  state: StoreState,
  input: MonthlyBudgetInput,
): Omit<MonthlyBudget, 'id' | 'revision'> {
  const user = requireCurrentUser(state);
  const existing = state.monthlyBudgets.find((budget) => budget.month === input.month);
  const updatedAt = todayIso();

  return {
    ...input,
    householdId: requireHouseholdId(state),
    createdBy: existing?.createdBy ?? user.uid,
    createdAt: existing?.createdAt ?? updatedAt,
    updatedBy: user.uid,
    updatedAt,
  };
}
function createFridgePayload(state: StoreState, input: FridgeItemInput): Omit<FridgeItem, 'id'> {
  const user = requireCurrentUser(state);

  return {
    ...input,
    householdId: requireHouseholdId(state),
    createdBy: user.uid,
    createdAt: todayIso(),
  };
}

function requireCurrentUser(state: StoreState) {
  if (!state.currentUser) {
    throw new Error('로그인이 필요해요.');
  }
  return state.currentUser;
}

function requireHouseholdId(state: StoreState) {
  if (!state.activeHouseholdId) {
    throw new Error('가구를 먼저 선택해주세요.');
  }
  return state.activeHouseholdId;
}

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '요청을 처리하지 못했어요.';
}
