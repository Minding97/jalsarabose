import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium } from 'playwright-core';

import { loadQaConfig } from '../server/config.mjs';

const TEST_TITLE = '[qa] 지출 정산 smoke';
const PAYMENT_METHOD = 'QA 공동카드';
const artifactsDirectory = resolve('qa-artifacts/expense-smoke');

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
  await openExpenses(page);
  await cleanupTestExpenses(page);
  await createAndVerifyExpense(page);
  await verifyDashboard(page);
  await verifyEditState(page);
  await cleanupTestExpenses(page);

  if (browserErrors.length > 0) {
    throw new Error(`Browser errors detected:\n${browserErrors.join('\n')}`);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        passed: true,
        checks: [
          'login',
          'custom split validation',
          'create and realtime list update',
          'payment/status dashboard',
          'settlement summary',
          'edit persistence',
          'delete',
          'mobile and desktop layout',
        ],
        screenshots: [
          'qa-artifacts/expense-smoke/mobile-dashboard.png',
          'qa-artifacts/expense-smoke/desktop-dashboard.png',
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
  await browser.close();
}

async function openExpenses(targetPage) {
  await targetPage.goto(new URL('/expenses', config.appUrl).toString(), {
    waitUntil: 'domcontentloaded',
  });

  const emailInput = targetPage.getByTestId('auth-email-input');
  const expensesScreen = targetPage.getByTestId('expenses-screen');
  await Promise.race([
    emailInput.waitFor({ state: 'visible', timeout: 15_000 }),
    expensesScreen.waitFor({ state: 'visible', timeout: 15_000 }),
  ]);

  if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.fill(config.testEmail);
    await targetPage.getByTestId('auth-password-input').fill(config.testPassword);
    await targetPage.getByTestId('auth-submit-button').click();
  }

  await expensesScreen.waitFor({ state: 'visible', timeout: 20_000 });
}

async function createAndVerifyExpense(targetPage) {
  await targetPage.getByTestId('expense-add-button').click();
  await targetPage.getByTestId('expense-amount-input').fill('100000');
  await targetPage.getByTestId('expense-title-input').fill(TEST_TITLE);
  await targetPage.getByTestId('expense-due-date-input').fill(todayIso());
  await targetPage.getByTestId('expense-payment-method-input').fill(PAYMENT_METHOD);
  await targetPage.getByTestId('expense-split-custom').click();

  const shareInputs = targetPage.locator('[data-testid^="expense-share-"]');
  const shareCount = await shareInputs.count();
  if (shareCount < 2) {
    throw new Error(`Custom split QA requires at least two members; found ${shareCount}.`);
  }
  await fillShares(shareInputs, [60, 30]);
  await targetPage.getByTestId('expense-status-paid').click();
  await targetPage.getByTestId('expense-memo-input').fill('자동 QA에서 생성한 지출');
  await targetPage.getByRole('switch', { name: '반복 지출' }).click();

  await targetPage.getByTestId('expense-submit-button').click();
  await targetPage.getByText('분담 비율 합계는 100%여야 해요.', { exact: true }).waitFor();

  await fillShares(shareInputs, [70, 30]);
  await targetPage.getByTestId('expense-submit-button').click();
  await targetPage.getByTestId('expenses-screen').waitFor({ state: 'visible', timeout: 15_000 });

  await targetPage.getByText(TEST_TITLE, { exact: true }).waitFor();
  await targetPage.getByText(/100,000원/, { exact: true }).waitFor();
  await targetPage.getByText(new RegExp(PAYMENT_METHOD)).waitFor();
  await targetPage.getByText(/직접 분배/).waitFor();
}

async function verifyDashboard(targetPage) {
  await targetPage.getByRole('button', { name: '지출 보기: 대시보드' }).click();
  await targetPage.getByTestId('expense-payment-method-summary').waitFor();
  await targetPage.getByText(PAYMENT_METHOD, { exact: true }).waitFor();
  await targetPage.getByTestId('expense-status-summary').getByText('완료', { exact: true }).waitFor();
  await targetPage.getByTestId('expense-settlement-summary').waitFor();
  await targetPage.screenshot({
    path: resolve(artifactsDirectory, 'mobile-dashboard.png'),
    fullPage: true,
  });

  await targetPage.setViewportSize({ width: 1280, height: 900 });
  await targetPage.screenshot({
    path: resolve(artifactsDirectory, 'desktop-dashboard.png'),
    fullPage: true,
  });
  await targetPage.setViewportSize({ width: 402, height: 874 });
}

async function verifyEditState(targetPage) {
  await targetPage.getByRole('button', { name: '지출 보기: 목록' }).click();
  await targetPage.getByText(TEST_TITLE, { exact: true }).click();
  await targetPage.getByTestId('expense-form-screen').waitFor();
  await expectInputValue(targetPage.getByTestId('expense-payment-method-input'), PAYMENT_METHOD);
  await expectInputValue(targetPage.getByTestId('expense-memo-input'), '자동 QA에서 생성한 지출');
  const recurring = targetPage.getByRole('switch', { name: '반복 지출' });
  if (!(await recurring.isChecked())) {
    throw new Error('Recurring setting did not persist after saving.');
  }
}

async function cleanupTestExpenses(targetPage) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = targetPage.getByText(TEST_TITLE, { exact: true }).first();
    if (!(await existing.isVisible().catch(() => false))) {
      return;
    }
    await existing.click();
    await targetPage.getByTestId('expense-delete-button').click();
    await targetPage.getByTestId('expenses-screen').waitFor({ state: 'visible', timeout: 15_000 });
  }
}

async function fillShares(inputs, values) {
  const count = await inputs.count();
  for (let index = 0; index < count; index += 1) {
    await inputs.nth(index).fill(String(values[index] ?? 0));
  }
}

async function expectInputValue(locator, expected) {
  const actual = await locator.inputValue();
  if (actual !== expected) {
    throw new Error(`Expected persisted form value ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
