import assert from 'node:assert/strict';

import { chromium } from 'playwright-core';

import { loadQaConfig } from '../server/config.mjs';

const appUrl = process.env.QA_APP_URL ?? 'http://127.0.0.1:8081';
const config = loadQaConfig();
const executablePath =
  process.env.QA_CHROME_EXECUTABLE_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const title = '[qa] 반복 집안일 smoke';
const desktop = process.argv.includes('--desktop');
const viewport = desktop ? { width: 1280, height: 900 } : { width: 390, height: 844 };
const successScreenshotPath = `/tmp/jalsarabose-chore-smoke-${desktop ? 'desktop' : 'mobile'}.png`;
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport });
const failures = [];

page.on('console', (message) => {
  if (message.type() === 'error') {
    failures.push(`console: ${message.text()}`);
  }
});
page.on('pageerror', (error) => failures.push(`page: ${error.message}`));
page.on('requestfailed', (request) => {
  failures.push(`request: ${request.method()} ${request.url()} (${request.failure()?.errorText})`);
});

try {
  await page.goto(`${appUrl}/chores`, { waitUntil: 'networkidle' });
  if (await page.getByTestId('auth-email-input').isVisible()) {
    assert(config.testEmail && config.testPassword, 'QA_TEST_EMAIL and QA_TEST_PASSWORD are required.');
    await page.getByTestId('auth-email-input').fill(config.testEmail);
    await page.getByTestId('auth-password-input').fill(config.testPassword);
    await page.getByTestId('auth-submit-button').click();
  }

  await page.getByTestId('chores-screen').waitFor();
  await deleteGeneratedChores(page);

  const completionButtons = page.locator('[data-testid^="chore-complete-button-"]');
  const initialCompletionCount = await completionButtons.count();

  await page.getByTestId('chore-add-button').click();
  await page.getByTestId('chore-title-input').fill(title);
  await page.getByTestId('chore-score-input').fill('5');
  await page.getByTestId('chore-submit-button').click();

  await page.getByText(title, { exact: true }).waitFor();
  assert.equal(await completionButtons.count(), initialCompletionCount + 1);

  await completionButtons.last().click();
  await page.getByText(title, { exact: true }).nth(1).waitFor();
  assert.equal(await page.getByText(title, { exact: true }).count(), 2);
  assert.equal(await completionButtons.count(), initialCompletionCount + 2);

  const firstOccurrence = await page.getByText(title, { exact: true }).nth(0).locator('..').innerText();
  const nextOccurrence = await page.getByText(title, { exact: true }).nth(1).locator('..').innerText();
  assert.match(firstOccurrence, /5점/);
  assert.match(nextOccurrence, /5점/);
  assert.notEqual(firstOccurrence, nextOccurrence, 'The next occurrence should change date or assignee.');

  await page.getByRole('button', { name: '집안일 보기: 대시보드' }).click();
  await assertText(page, '오늘 수행률');
  await assertText(page, '이번 주');
  await assertText(page, '이번 달 수행 기여도');

  assert.deepEqual(failures, []);
  await page.screenshot({ path: successScreenshotPath, fullPage: true });
  await page.getByRole('button', { name: '집안일 보기: 목록' }).click();
  await deleteGeneratedChores(page);
  console.log(`Chore UI smoke test passed: ${successScreenshotPath}`);
} catch (error) {
  const screenshotPath = '/tmp/jalsarabose-chore-smoke-failure.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.error(`URL: ${page.url()}`);
  console.error(`Screen: ${(await page.locator('body').innerText()).slice(0, 3000)}`);
  console.error(`Screenshot: ${screenshotPath}`);
  try {
    if (await page.getByTestId('chores-screen').isVisible()) {
      const listButton = page.getByRole('button', { name: '집안일 보기: 목록' });
      if (await listButton.isVisible()) {
        await listButton.click();
      }
      await deleteGeneratedChores(page);
    }
  } catch (cleanupError) {
    console.error(`Cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : cleanupError}`);
  }
  throw error;
} finally {
  await browser.close();
}

async function assertText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor();
}

async function deleteGeneratedChores(page) {
  while ((await page.getByText(title, { exact: true }).count()) > 0) {
    await page.getByText(title, { exact: true }).first().click();
    await page.getByTestId('chore-form-screen').waitFor();
    await page.getByRole('button', { name: '삭제' }).click();
    await page.getByTestId('chores-screen').waitFor();
  }
}
