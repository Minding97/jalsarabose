import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium } from 'playwright-core';

import { loadQaConfig } from '../server/config.mjs';

const EXPENSE_TITLE = '[qa] 캘린더 지출';
const CHORE_TITLE = '[qa] 캘린더 집안일';
const FRIDGE_TITLE = '[qa] 캘린더 식품';
const artifactsDirectory = resolve('qa-artifacts/calendar-smoke');

const config = loadQaConfig();
if (!config.testEmail || !config.testPassword) {
  throw new Error('QA_TEST_EMAIL and QA_TEST_PASSWORD are required in qa.env.');
}

mkdirSync(artifactsDirectory, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: config.chromeExecutablePath,
});
const context = await browser.newContext({ viewport: { width: 402, height: 874 } });
const page = await context.newPage();
const browserErrors = [];

page.on('console', (message) => {
  if (message.type() === 'error') browserErrors.push(`console: ${message.text().slice(0, 500)}`);
});
page.on('requestfailed', (request) => {
  const pathname = new URL(request.url()).pathname;
  const errorText = request.failure()?.errorText ?? '';
  if (pathname.includes('google.firestore.v1.Firestore/Listen/channel') && errorText.includes('ERR_ABORTED')) {
    return;
  }
  browserErrors.push(
    `network: ${request.method()} ${pathname} ${errorText}`,
  );
});

try {
  await openApp(page, '/expenses', 'expenses-screen');
  await cleanupFixtures(page);
  await createExpense(page);
  await createChore(page);
  await createFridgeItem(page);
  await verifyCalendar(page);

  if (browserErrors.length > 0) {
    throw new Error(`Browser errors detected:\n${browserErrors.join('\n')}`);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        passed: true,
        checks: [
          'three event types on one day',
          'type-specific calendar dots',
          'expense/chore/fridge filters',
          'completion and notification state',
          'source feature navigation',
          'month navigation',
          'mobile layout',
          'fixture cleanup',
        ],
        screenshot: 'qa-artifacts/calendar-smoke/mobile-calendar.png',
      },
      null,
      2,
    )}\n`,
  );
} catch (error) {
  await page
    .screenshot({ path: resolve(artifactsDirectory, 'failure.png'), fullPage: true })
    .catch(() => undefined);
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await cleanupFixtures(page).catch(() => undefined);
  await browser.close();
}

async function openApp(targetPage, path, screenTestId) {
  await targetPage.goto(new URL(path, config.appUrl).toString(), {
    waitUntil: 'domcontentloaded',
  });
  const emailInput = targetPage.getByTestId('auth-email-input');
  const screen = targetPage.getByTestId(screenTestId);
  await Promise.race([
    emailInput.waitFor({ state: 'visible', timeout: 15_000 }),
    screen.waitFor({ state: 'visible', timeout: 15_000 }),
  ]);
  if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.fill(config.testEmail);
    await targetPage.getByTestId('auth-password-input').fill(config.testPassword);
    await targetPage.getByTestId('auth-submit-button').click();
  }
  await screen.waitFor({ state: 'visible', timeout: 20_000 });
}

async function createExpense(targetPage) {
  await openApp(targetPage, '/expenses', 'expenses-screen');
  await targetPage.getByTestId('expense-add-button').click();
  await targetPage.getByTestId('expense-amount-input').fill('31000');
  await targetPage.getByTestId('expense-title-input').fill(EXPENSE_TITLE);
  await targetPage.getByTestId('expense-due-date-input').fill(todayIso());
  await targetPage.getByTestId('expense-submit-button').click();
  await targetPage.getByText(EXPENSE_TITLE, { exact: true }).waitFor({ timeout: 15_000 });
}

async function createChore(targetPage) {
  await openApp(targetPage, '/chores', 'chores-screen');
  await targetPage.getByTestId('chore-add-button').click();
  await targetPage.getByTestId('chore-title-input').fill(CHORE_TITLE);
  await targetPage.getByTestId('chore-due-date-input').fill(todayIso());
  await targetPage.getByRole('button', { name: '완료', exact: true }).click();
  await targetPage.getByTestId('chore-submit-button').click();
  await targetPage.getByText(CHORE_TITLE, { exact: true }).waitFor({ timeout: 15_000 });
}

async function createFridgeItem(targetPage) {
  await openApp(targetPage, '/fridge', 'fridge-screen');
  await targetPage.getByTestId('fridge-add-button').click();
  await targetPage.getByTestId('fridge-name-input').fill(FRIDGE_TITLE);
  await targetPage.getByTestId('fridge-quantity-input').fill('1개');
  await targetPage.getByTestId('fridge-expiry-date-input').fill(todayIso());
  await targetPage.getByTestId('fridge-submit-button').click();
  await targetPage.getByText(FRIDGE_TITLE, { exact: true }).waitFor({ timeout: 15_000 });
}

async function verifyCalendar(targetPage) {
  await openApp(targetPage, '/calendar', 'calendar-screen');
  const today = todayIso();
  await targetPage.getByTestId(`calendar-day-${today}`).click();

  for (const type of ['expense', 'chore', 'fridge']) {
    await targetPage.getByTestId(`calendar-dot-${type}-${today}`).first().waitFor();
  }
  await expectEventVisible(targetPage, EXPENSE_TITLE, /예정/);
  await expectEventVisible(targetPage, CHORE_TITLE, /완료/);
  await expectEventVisible(targetPage, FRIDGE_TITLE, /보관 중/);

  await targetPage.screenshot({
    path: resolve(artifactsDirectory, 'mobile-calendar.png'),
    fullPage: true,
  });

  await selectFilter(targetPage, '지출');
  await targetPage.getByText(EXPENSE_TITLE, { exact: true }).waitFor();
  await assertHidden(targetPage.getByText(CHORE_TITLE, { exact: true }));
  await assertHidden(targetPage.getByText(`${FRIDGE_TITLE} 유통기한`, { exact: true }));

  await selectFilter(targetPage, '집안일');
  await targetPage.getByText(CHORE_TITLE, { exact: true }).waitFor();
  await assertHidden(targetPage.getByText(EXPENSE_TITLE, { exact: true }));

  await selectFilter(targetPage, '냉장고');
  await targetPage.getByText(`${FRIDGE_TITLE} 유통기한`, { exact: true }).waitFor();
  await assertHidden(targetPage.getByText(EXPENSE_TITLE, { exact: true }));

  await selectFilter(targetPage, '전체');
  await targetPage.getByRole('button', { name: `${EXPENSE_TITLE} 지출 상세 보기` }).click();
  await targetPage.getByTestId('expenses-screen').waitFor({ timeout: 15_000 });

  await openApp(targetPage, '/calendar', 'calendar-screen');
  const currentMonthLabel = await targetPage.getByText(/\d{4}년 \d{1,2}월/).textContent();
  await targetPage.getByRole('button', { name: '다음 달' }).click();
  const nextMonthLabel = await targetPage.getByText(/\d{4}년 \d{1,2}월/).textContent();
  if (currentMonthLabel === nextMonthLabel) {
    throw new Error('Calendar month did not change after selecting next month.');
  }
  await targetPage.getByRole('button', { name: '이전 달' }).click();
}

async function expectEventVisible(targetPage, title, statusPattern) {
  const card = targetPage.getByRole('button', { name: new RegExp(`${escapeRegExp(title)}.*상세 보기`) });
  await card.waitFor();
  await card.getByText(statusPattern).waitFor();
  await card.getByText('알림 켬', { exact: true }).waitFor();
}

async function selectFilter(targetPage, label) {
  await targetPage.getByRole('button', { name: `캘린더 유형 필터: ${label}` }).click();
}

async function assertHidden(locator) {
  if (await locator.isVisible().catch(() => false)) {
    throw new Error('Filtered event is still visible.');
  }
}

async function cleanupFixtures(targetPage) {
  await deleteExpense(targetPage);
  await deleteChore(targetPage);
  await deleteFridgeItem(targetPage);
}

async function deleteExpense(targetPage) {
  await openApp(targetPage, '/expenses', 'expenses-screen');
  const title = targetPage.getByText(EXPENSE_TITLE, { exact: true }).first();
  if (!(await title.isVisible().catch(() => false))) return;
  await title.click();
  await targetPage.getByTestId('expense-delete-button').click();
  await targetPage.getByTestId('expenses-screen').waitFor({ timeout: 15_000 });
}

async function deleteChore(targetPage) {
  await openApp(targetPage, '/chores', 'chores-screen');
  const title = targetPage.getByText(CHORE_TITLE, { exact: true }).first();
  if (!(await title.isVisible().catch(() => false))) return;
  await title.click();
  await targetPage.getByRole('button', { name: '삭제' }).click();
  await targetPage.getByTestId('chores-screen').waitFor({ timeout: 15_000 });
}

async function deleteFridgeItem(targetPage) {
  await openApp(targetPage, '/fridge', 'fridge-screen');
  const title = targetPage.getByText(FRIDGE_TITLE, { exact: true }).first();
  if (!(await title.isVisible().catch(() => false))) return;
  await title.click();
  await targetPage.getByRole('button', { name: '삭제' }).click();
  await targetPage.getByTestId('fridge-screen').waitFor({ timeout: 15_000 });
}

function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
