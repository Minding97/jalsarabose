import type { HouseholdSnapshot, ISODate, UserProfile } from '@/domain/types';

type MyMemoSource = Pick<HouseholdSnapshot, 'members' | 'expenses' | 'fridgeItems'>;

export type MyMemo = {
  id: string;
  kind: 'expense' | 'fridge';
  kindLabel: '지출' | '냉장고';
  title: string;
  memo: string;
  createdAt: ISODate;
};

export function getMyMemos(
  snapshot: MyMemoSource,
  currentUser: UserProfile | null,
): MyMemo[] {
  if (!currentUser) {
    return [];
  }

  const creatorIds = new Set([currentUser.uid]);
  snapshot.members
    .filter(
      (member) => member.userId === currentUser.uid || member.id === currentUser.uid,
    )
    .forEach((member) => {
      creatorIds.add(member.id);
      creatorIds.add(member.userId);
    });

  const expenseMemos: MyMemo[] = snapshot.expenses.flatMap((expense) => {
    const memo = expense.memo?.trim();
    if (!memo || !creatorIds.has(expense.createdBy)) {
      return [];
    }

    return [
      {
        id: expense.id,
        kind: 'expense',
        kindLabel: '지출',
        title: expense.title,
        memo,
        createdAt: expense.createdAt,
      },
    ];
  });

  const fridgeMemos: MyMemo[] = snapshot.fridgeItems.flatMap((item) => {
    const memo = item.memo?.trim();
    if (!memo || !creatorIds.has(item.createdBy)) {
      return [];
    }

    return [
      {
        id: item.id,
        kind: 'fridge',
        kindLabel: '냉장고',
        title: item.name,
        memo,
        createdAt: item.createdAt,
      },
    ];
  });

  return [...expenseMemos, ...fridgeMemos].sort(
    (left, right) =>
      right.createdAt.localeCompare(left.createdAt) ||
      left.kind.localeCompare(right.kind) ||
      left.id.localeCompare(right.id),
  );
}
