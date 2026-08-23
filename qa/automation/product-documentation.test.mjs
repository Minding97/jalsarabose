import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(resolve(repositoryRoot, path), 'utf8');

test('product brief defines measurable success criteria and release gates', () => {
  const brief = read('docs/product-brief.md');

  for (const id of ['SC-01', 'SC-02', 'SC-03', 'SC-04', 'SC-05', 'SC-06']) {
    assert.equal(brief.match(new RegExp(`\\| ${id} \\|`, 'g'))?.length, 1, `${id} must have one table row`);
  }

  for (const id of ['RG-01', 'RG-02', 'RG-03', 'RG-04', 'RG-05']) {
    assert.equal(brief.match(new RegExp(`\\| ${id} \\|`, 'g'))?.length, 1, `${id} must have one table row`);
  }

  assert.match(brief, /서로 다른 테스트 계정 2개/);
  assert.match(brief, /iOS와 Android 실제 기기/);
  assert.match(brief, /열린 P0\/P1 결함이 0건/);
  assert.match(brief, /기능 구현 완료, 외부 릴리즈 준비 중/);
  assert.match(brief, /npm run qa:test.*npm run verify.*npm run test:firestore-rules/);
});

test('README and Notion handoff point to the canonical status and match current features', () => {
  const readme = read('README.md');
  const summary = read('docs/notion-handoff/00_프로젝트_요약.md');
  const status = read('docs/notion-handoff/01_MVP_구현_상태.md');

  assert.match(readme, /docs\/product-brief\.md/);
  assert.match(summary, /\.\.\/product-brief\.md/);
  assert.match(status, /\.\.\/product-brief\.md/);

  for (const document of [readme, summary, status]) {
    assert.match(document, /월 공동생활비/);
    assert.match(document, /외부 릴리즈 준비 중/);
  }

  assert.doesNotMatch(summary, /디자인 적용 전 단계|현재 UI는 임시 스타일/);
  assert.doesNotMatch(status, /\| 알림 \| 준비 완료 \| 실제 푸시/);
});

test('documented implementation status remains backed by active code paths', () => {
  assert.match(read('src/app/expenses.tsx'), /testID="monthly-budget-edit-button"/);
  assert.match(read('src/domain/monthly-budget.ts'), /validateMonthlyBudgetInput/);
  assert.match(read('src/domain/settlement.ts'), /getSettlement/);
  assert.match(read('src/store/household-store.ts'), /scheduleNotifications: async/);
  assert.match(read('src/app/chores.tsx'), /<Redirect href="\/" \/>/);
});
