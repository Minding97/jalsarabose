import { Firestore, doc, getDoc, runTransaction } from 'firebase/firestore';

import type { MonthlyBudget } from '../domain/types';

export const MONTHLY_BUDGET_CONFLICT_MESSAGE =
  '다른 구성원이 이 달의 예산을 먼저 변경했어요. 최신 내용을 확인한 뒤 다시 저장해 주세요.';

export class MonthlyBudgetConflictError extends Error {
  constructor() {
    super(MONTHLY_BUDGET_CONFLICT_MESSAGE);
    this.name = 'MonthlyBudgetConflictError';
  }
}

type MonthlyBudgetWrite = Omit<MonthlyBudget, 'id' | 'revision'>;

function currentRevision(exists: boolean, data: Record<string, unknown> | undefined) {
  if (!exists) return 0;
  const revision = data?.revision;
  return typeof revision === 'number' && Number.isInteger(revision) && revision > 0 ? revision : 1;
}

export async function saveMonthlyBudgetWithRevision(
  db: Firestore,
  householdId: string,
  budget: MonthlyBudgetWrite,
  expectedRevision: number,
) {
  const householdRef = doc(db, 'households', householdId);
  const budgetRef = doc(db, 'households', householdId, 'monthlyBudgets', budget.month);

  try {
    return await runTransaction(db, async (transaction) => {
    const [householdSnapshot, budgetSnapshot] = await Promise.all([
      transaction.get(householdRef),
      transaction.get(budgetRef),
    ]);

    if (!householdSnapshot.exists()) {
      throw new Error('가구 정보를 찾을 수 없어요.');
    }

    const revision = currentRevision(budgetSnapshot.exists(), budgetSnapshot.data());
    if (revision !== expectedRevision) {
      throw new MonthlyBudgetConflictError();
    }

    if (!Array.isArray(householdSnapshot.data().memberIds)) {
      transaction.update(householdRef, {
        memberIds: Object.keys(budget.memberContributions),
      });
    }

    const existing = budgetSnapshot.data();
    const nextBudget = {
      ...budget,
      createdBy: budgetSnapshot.exists() ? existing?.createdBy : budget.createdBy,
      createdAt: budgetSnapshot.exists() ? existing?.createdAt : budget.createdAt,
      revision: revision + 1,
    };
    transaction.set(budgetRef, nextBudget);
    return revision + 1;
    });
  } catch (error) {
    if (error instanceof MonthlyBudgetConflictError) throw error;

    // The emulator and backend may reject a racing write at rules evaluation before
    // the SDK retries its callback. Re-read only to classify that known stale-write case;
    // unrelated authorization and transport errors keep their original identity.
    const latest = await getDoc(budgetRef).catch(() => null);
    if (latest && currentRevision(latest.exists(), latest.data()) !== expectedRevision) {
      throw new MonthlyBudgetConflictError();
    }
    throw error;
  }
}
