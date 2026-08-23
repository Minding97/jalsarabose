import type { HouseholdSnapshot, UserProfile } from '../domain/types';

function todayIso() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type MockAccount = {
  password: string;
  profile: UserProfile;
};

type MockSession = {
  profile: UserProfile;
  snapshot: HouseholdSnapshot | null;
};

const emptySnapshot = (): HouseholdSnapshot => ({
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
});

/**
 * A deliberately process-local backend for deterministic browser QA. It is only
 * enabled by EXPO_PUBLIC_QA_E2E and never replaces the normal mock preview or Firebase.
 */
export class E2eMockBackend {
  private readonly accounts = new Map<string, MockAccount>();
  private readonly households = new Map<string, HouseholdSnapshot>();

  signUp(email: string, password: string, displayName: string): MockSession {
    const normalizedEmail = email.trim().toLowerCase();
    if (this.accounts.has(normalizedEmail)) {
      throw new Error('이미 가입된 이메일이에요.');
    }

    const now = todayIso();
    const profile: UserProfile = {
      uid: `e2e-user-${this.accounts.size + 1}`,
      email: normalizedEmail,
      displayName: displayName.trim(),
      activeHouseholdId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.accounts.set(normalizedEmail, { password, profile });
    return { profile: clone(profile), snapshot: null };
  }

  signIn(email: string, password: string): MockSession {
    const account = this.accounts.get(email.trim().toLowerCase());
    if (!account || account.password !== password) {
      throw new Error('이메일 또는 비밀번호를 확인해주세요.');
    }

    return this.sessionFor(account.profile);
  }

  createHousehold(profile: UserProfile, name: string): MockSession {
    const sequence = this.households.size + 1;
    const householdId = `e2e-household-${sequence}`;
    const snapshot: HouseholdSnapshot = {
      ...emptySnapshot(),
      household: {
        id: householdId,
        name: name.trim(),
        inviteCode: `QA${String(sequence).padStart(4, '0')}`,
        createdBy: profile.uid,
        createdAt: todayIso(),
        memberIds: [profile.uid],
      },
      members: [
        {
          id: profile.uid,
          householdId,
          userId: profile.uid,
          name: profile.displayName,
          role: 'admin',
          joinedAt: todayIso(),
        },
      ],
    };
    const updatedProfile = this.updateActiveHousehold(profile, householdId);
    this.households.set(householdId, clone(snapshot));
    return { profile: updatedProfile, snapshot: clone(snapshot) };
  }

  joinHousehold(profile: UserProfile, inviteCode: string): MockSession {
    const normalizedCode = inviteCode.trim().toUpperCase();
    const entry = [...this.households.entries()].find(
      ([, snapshot]) => snapshot.household.inviteCode === normalizedCode,
    );
    if (!entry) {
      throw new Error('초대 코드를 확인해주세요.');
    }

    const [householdId, storedSnapshot] = entry;
    const snapshot = clone(storedSnapshot);
    if (!snapshot.members.some((member) => member.userId === profile.uid)) {
      snapshot.household.memberIds.push(profile.uid);
      snapshot.members.push({
        id: profile.uid,
        householdId,
        userId: profile.uid,
        name: profile.displayName,
        role: 'member',
        joinedAt: todayIso(),
      });
      this.households.set(householdId, clone(snapshot));
    }

    return {
      profile: this.updateActiveHousehold(profile, householdId),
      snapshot,
    };
  }

  saveSnapshot(snapshot: HouseholdSnapshot) {
    if (!snapshot.household.id || !this.households.has(snapshot.household.id)) {
      return;
    }
    this.households.set(snapshot.household.id, clone(snapshot));
  }

  private sessionFor(profile: UserProfile): MockSession {
    const snapshot = profile.activeHouseholdId
      ? this.households.get(profile.activeHouseholdId) ?? null
      : null;
    return { profile: clone(profile), snapshot: snapshot ? clone(snapshot) : null };
  }

  private updateActiveHousehold(profile: UserProfile, householdId: string) {
    const account = this.accounts.get(profile.email.toLowerCase());
    const updatedProfile = {
      ...profile,
      activeHouseholdId: householdId,
      updatedAt: todayIso(),
    };
    if (account) {
      account.profile = updatedProfile;
    }
    return clone(updatedProfile);
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export const e2eMockBackend = new E2eMockBackend();
