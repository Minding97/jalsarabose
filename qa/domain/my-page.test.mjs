import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getMyMemos } from '../../src/utils/my-page.ts';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const currentUser = {
  uid: 'user-minseo',
  email: 'minseo@example.com',
  displayName: '민서',
  activeHouseholdId: 'home',
  createdAt: '2026-08-01',
  updatedAt: '2026-08-01',
};

const memoSource = {
  members: [
    {
      id: 'member-minseo',
      householdId: 'home',
      userId: 'user-minseo',
      name: '민서',
      role: 'admin',
      joinedAt: '2026-08-01',
    },
    {
      id: 'member-jihoon',
      householdId: 'home',
      userId: 'user-jihoon',
      name: '지훈',
      role: 'member',
      joinedAt: '2026-08-01',
    },
  ],
  expenses: [
    {
      id: 'legacy-expense',
      title: '관리비',
      memo: '  영수증 확인  ',
      createdBy: 'member-minseo',
      createdAt: '2026-08-18',
    },
    {
      id: 'uid-expense',
      title: '장보기',
      memo: '카드 내역 확인',
      createdBy: 'user-minseo',
      createdAt: '2026-08-20',
    },
    {
      id: 'other-expense',
      title: '인터넷',
      memo: '지훈 메모',
      createdBy: 'member-jihoon',
      createdAt: '2026-08-21',
    },
    {
      id: 'blank-expense',
      title: '전기료',
      memo: '   ',
      createdBy: 'user-minseo',
      createdAt: '2026-08-22',
    },
  ],
  fridgeItems: [
    {
      id: 'milk',
      name: '우유',
      memo: '개봉함',
      createdBy: 'member-minseo',
      createdAt: '2026-08-19',
    },
  ],
};

test('collects only the current account memos across user and legacy member creator ids', () => {
  assert.deepEqual(getMyMemos(memoSource, currentUser), [
    {
      id: 'uid-expense',
      kind: 'expense',
      kindLabel: '지출',
      title: '장보기',
      memo: '카드 내역 확인',
      createdAt: '2026-08-20',
    },
    {
      id: 'milk',
      kind: 'fridge',
      kindLabel: '냉장고',
      title: '우유',
      memo: '개봉함',
      createdAt: '2026-08-19',
    },
    {
      id: 'legacy-expense',
      kind: 'expense',
      kindLabel: '지출',
      title: '관리비',
      memo: '영수증 확인',
      createdAt: '2026-08-18',
    },
  ]);
  assert.deepEqual(getMyMemos(memoSource, null), []);
});

test('wires account details and personal memos into the my-page sheet', () => {
  const profileSheet = readFileSync(
    resolve(repositoryRoot, 'src/components/profile-sheet.tsx'),
    'utf8',
  );

  assert.match(profileSheet, /profile-account-section/);
  assert.match(profileSheet, /currentUser\?\.email/);
  assert.match(profileSheet, /profile-memo-section/);
  assert.match(profileSheet, /getMyMemos\(\{ members, expenses, fridgeItems \}, currentUser\)/);
  assert.match(profileSheet, /남긴 메모가 없어요/);
});
