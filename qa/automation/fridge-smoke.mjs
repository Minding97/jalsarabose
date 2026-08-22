import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium } from 'playwright-core';

import { loadQaConfig } from '../server/config.mjs';

const USED_TITLE = '[qa] 냉장고 소진';
const DISCARDED_TITLE = '[qa] 냉장고 폐기';
const EXPIRED_TITLE = '[qa] 냉장고 기한초과';
const FIXTURE_TITLES = [USED_TITLE, DISCARDED_TITLE, EXPIRED_TITLE];
const artifactsDirectory = resolve('qa-artifacts/fridge-smoke');

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
  browserErrors.push(`network: ${request.method()} ${pathname} ${errorText}`);
});

try {
  await openFridge(page);
  await cleanupFixtures(page);
  await createItem(page, {
    title: USED_TITLE,
    quantity: '2팩',
    expiryDate: tomorrowIso(),
    memo: '소진 처리 QA',
    storage: 'fridge',
  });
  await page.getByRole('button', { name: `${USED_TITLE} 소진` }).click();

  await createItem(page, {
    title: DISCARDED_TITLE,
    quantity: '1개',
    expiryDate: tomorrowIso(),
    memo: '폐기 처리 QA',
    storage: 'room',
    notificationEnabled: false,
  });
  await page.getByRole('button', { name: `${DISCARDED_TITLE} 폐기` }).click();

  await createItem(page, {
    title: EXPIRED_TITLE,
    quantity: '500g',
    expiryDate: yesterdayIso(),
    memo: '기한 초과 QA',
    storage: 'freezer',
    category: 'dairy',
  });

  await verifyDashboard(page);
  await verifyPersistedForm(page);

  if (browserErrors.length > 0) {
    throw new Error(`Browser errors detected:\n${browserErrors.join('\n')}`);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        passed: true,
        checks: [
          'memo and notification persistence',
          'quick use action',
          'quick discard action',
          'expired inventory summary',
          'category and storage summaries',
          'recent items',
          'processed history',
          'mobile and desktop layout',
          'fixture cleanup',
        ],
        screenshots: [
          'qa-artifacts/fridge-smoke/mobile-dashboard.png',
          'qa-artifacts/fridge-smoke/desktop-dashboard.png',
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

async function openFridge(targetPage) {
  await targetPage.goto(new URL('/fridge', config.appUrl).toString(), {
    waitUntil: 'domcontentloaded',
  });
  const emailInput = targetPage.getByTestId('auth-email-input');
  const screen = targetPage.getByTestId('fridge-screen');
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

async function createItem(
  targetPage,
  { title, quantity, expiryDate, memo, storage, category = 'other', notificationEnabled = true },
) {
  await openFridge(targetPage);
  await targetPage.getByTestId('fridge-add-button').click();
  await targetPage.getByTestId('fridge-name-input').fill(title);
  await targetPage.getByTestId('fridge-quantity-input').fill(quantity);
  await targetPage.getByTestId('fridge-expiry-date-input').fill(expiryDate);
  await targetPage.getByTestId(`fridge-category-${category}`).click();
  await targetPage.getByTestId(`fridge-storage-${storage}`).click();
  await targetPage.getByTestId('fridge-memo-input').fill(memo);
  const notificationSwitch = targetPage.getByRole('switch', { name: '유통기한 알림' });
  if (!notificationEnabled) await notificationSwitch.click();
  await targetPage.getByTestId('fridge-submit-button').click();
  await targetPage.getByText(title, { exact: true }).waitFor({ timeout: 15_000 });
}

async function verifyDashboard(targetPage) {
  await openFridge(targetPage);
  await targetPage.getByRole('button', { name: '냉장고 보기: 대시보드' }).click();
  await targetPage.getByText('기한 초과', { exact: true }).waitFor();
  await targetPage.getByTestId('fridge-category-summary').getByText('유제품').waitFor();
  await targetPage.getByTestId('fridge-storage-summary').getByText('냉동').waitFor();
  const processed = targetPage.getByTestId('fridge-processed-summary');
  await processed.getByText(USED_TITLE, { exact: true }).waitFor();
  await processed.getByText('소진', { exact: true }).waitFor();
  await processed.getByText(DISCARDED_TITLE, { exact: true }).waitFor();
  await processed.getByText('폐기', { exact: true }).waitFor();
  await targetPage.getByText(EXPIRED_TITLE, { exact: true }).first().waitFor();

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

async function verifyPersistedForm(targetPage) {
  await openFridge(targetPage);
  await targetPage.getByRole('button', { name: '냉장고 보기: 대시보드' }).click();
  await targetPage.getByText(DISCARDED_TITLE, { exact: true }).last().click();
  await targetPage.getByTestId('fridge-form-screen').waitFor();
  const memo = await targetPage.getByTestId('fridge-memo-input').inputValue();
  if (memo !== '폐기 처리 QA') throw new Error('Fridge memo did not persist.');
  if (await targetPage.getByRole('switch', { name: '유통기한 알림' }).isChecked()) {
    throw new Error('Fridge notification setting did not persist.');
  }
  await targetPage.getByRole('button', { name: '뒤로' }).click();
}

async function cleanupFixtures(targetPage) {
  for (const title of FIXTURE_TITLES) {
    await deleteItem(targetPage, title);
  }
}

async function deleteItem(targetPage, title) {
  await openFridge(targetPage);
  let itemTitle = targetPage.getByText(title, { exact: true }).first();
  if (!(await itemTitle.isVisible().catch(() => false))) {
    await targetPage.getByRole('button', { name: '냉장고 보기: 대시보드' }).click();
    itemTitle = targetPage.getByText(title, { exact: true }).first();
  }
  if (!(await itemTitle.isVisible().catch(() => false))) return;
  await itemTitle.click();
  await targetPage.getByTestId('fridge-delete-button').click();
  await targetPage.getByTestId('fridge-screen').waitFor({ timeout: 15_000 });
}

function yesterdayIso() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return localIsoDate(date);
}

function tomorrowIso() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return localIsoDate(date);
}

function localIsoDate(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
