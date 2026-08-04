import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium } from 'playwright-core';

import { loadQaConfig } from '../server/config.mjs';

const EXPENSE_TITLE = '[qa] 홈 다가오는 지출';
const CHORE_TITLE = '[qa] 홈 오늘 집안일';
const FRIDGE_TITLE = '[qa] 홈 임박 식품';
const artifactsDirectory = resolve('qa-artifacts/home-smoke');

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
  if (message.type() === 'error') {
    browserErrors.push(`console: ${message.text().slice(0, 500)}`);
  }
});
page.on('requestfailed', (request) => {
  browserErrors.push(
    `network: ${request.method()} ${new URL(request.url()).pathname} ${request.failure()?.errorText ?? ''}`,
  );
});

try {
  await openApp(page, '/expenses', 'expenses-screen');
  await cleanupFixtures(page);
  await createExpense(page);
  await createCompletedChore(page);
  await createFridgeItem(page);
  await verifyHome(page);

  if (browserErrors.length > 0) {
    throw new Error(`Browser errors detected:\n${browserErrors.join('\n')}`);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        passed: true,
        checks: [
          'household name and member count',
          'today chores',
          'upcoming expense',
          'expiring fridge item',
          'monthly expense total',
          'member chore contribution',
          'mobile and desktop layout',
          'fixture cleanup',
        ],
        screenshots: [
          'qa-artifacts/home-smoke/mobile-home.png',
          'qa-artifacts/home-smoke/desktop-home.png',
        ],
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
  await targetPage.getByTestId('expense-amount-input').fill('42000');
  await targetPage.getByTestId('expense-title-input').fill(EXPENSE_TITLE);
  await targetPage.getByTestId('expense-due-date-input').fill(tomorrowIso());
  await targetPage.getByTestId('expense-submit-button').click();
  await targetPage.getByText(EXPENSE_TITLE, { exact: true }).waitFor({ timeout: 15_000 });
}

async function createCompletedChore(targetPage) {
  await openApp(targetPage, '/chores', 'chores-screen');
  await targetPage.getByTestId('chore-add-button').click();
  await targetPage.getByTestId('chore-title-input').fill(CHORE_TITLE);
  await targetPage.getByTestId('chore-due-date-input').fill(todayIso());
  await targetPage.getByTestId('chore-submit-button').click();
  const completeButton = targetPage.getByRole('checkbox', { name: `${CHORE_TITLE} 완료` });
  await completeButton.waitFor({ timeout: 15_000 });
  await completeButton.click();
  await targetPage.waitForTimeout(1_000);
}

async function createFridgeItem(targetPage) {
  await openApp(targetPage, '/fridge', 'fridge-screen');
  await targetPage.getByTestId('fridge-add-button').click();
  await targetPage.getByTestId('fridge-name-input').fill(FRIDGE_TITLE);
  await targetPage.getByTestId('fridge-quantity-input').fill('1개');
  await targetPage.getByTestId('fridge-expiry-date-input').fill(tomorrowIso());
  await targetPage.getByTestId('fridge-submit-button').click();
  await targetPage.getByText(FRIDGE_TITLE, { exact: true }).waitFor({ timeout: 15_000 });
}

async function verifyHome(targetPage) {
  await openApp(targetPage, '/', 'home-screen');
  const householdMeta = targetPage.getByTestId('home-household-meta');
  await householdMeta.waitFor();
  if (!(await householdMeta.textContent())?.match(/가구원\s+\d+명/)) {
    throw new Error('Household name and member count are missing from the home header.');
  }

  await targetPage.getByText('오늘 해야 할 일', { exact: true }).waitFor();
  await targetPage.getByText(CHORE_TITLE, { exact: true }).first().waitFor();
  await targetPage.getByTestId('home-upcoming-expenses').getByText(EXPENSE_TITLE).waitFor();
  await targetPage.getByTestId('home-upcoming-expenses').getByText('42,000원').waitFor();
  await targetPage.getByTestId('home-fridge-summary').getByText(FRIDGE_TITLE).waitFor();
  await targetPage.getByTestId('home-expense-summary').getByText(/42,000원/).waitFor();
  await targetPage.getByTestId('home-chore-summary').getByText(/1점 · \d+%/).waitFor();

  await targetPage.screenshot({
    path: resolve(artifactsDirectory, 'mobile-home.png'),
    fullPage: true,
  });
  await targetPage.setViewportSize({ width: 1280, height: 900 });
  await targetPage.screenshot({
    path: resolve(artifactsDirectory, 'desktop-home.png'),
    fullPage: true,
  });
  await targetPage.setViewportSize({ width: 402, height: 874 });
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
  return localIsoDate(new Date());
}

function tomorrowIso() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return localIsoDate(tomorrow);
}

function localIsoDate(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
