import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium } from 'playwright-core';

import { loadQaConfig } from '../server/config.mjs';

const TEMPORARY_HOUSEHOLD_NAME = '[qa] 권한 검증 집';
const artifactsDirectory = resolve('qa-artifacts/household-policy-smoke');

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
let originalHouseholdName = '';
let promotedMember = false;

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
  await openProfile(page);
  originalHouseholdName = (await page.getByTestId('profile-household-name').textContent())?.trim() ?? '';
  if (!originalHouseholdName) throw new Error('Current household name could not be read.');

  await renameHousehold(page, TEMPORARY_HOUSEHOLD_NAME);
  await page.getByText('가구 이름을 변경했어요.', { exact: true }).waitFor();

  const promoteButton = page.getByRole('button', { name: /관리자로 지정$/ }).first();
  await promoteButton.waitFor();
  if ((await page.locator('[data-testid^="profile-member-role-button-"]').count()) !== 1) {
    throw new Error('Only the other household member should have an editable role control.');
  }
  await promoteButton.click();
  promotedMember = true;
  await page.getByText('관리자로 지정했어요.', { exact: true }).waitFor();
  await page.getByRole('button', { name: /가구원으로 변경$/ }).first().waitFor();

  await page.screenshot({
    path: resolve(artifactsDirectory, 'admin-management.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: /가구원으로 변경$/ }).first().click();
  await page.getByText('일반 가구원으로 변경했어요.', { exact: true }).waitFor();
  await page.getByRole('button', { name: /관리자로 지정$/ }).first().waitFor();
  promotedMember = false;

  const currentInviteCode = (await page.getByTestId('profile-invite-code').textContent())?.trim() ?? '';
  await page.getByTestId('profile-household-switch-button').click();
  await page.getByTestId('profile-household-code-input').fill(currentInviteCode);
  await page.getByTestId('profile-household-join-button').click();
  await page.getByText('현재 참여 중인 가구의 초대 코드예요.', { exact: true }).waitFor();

  await renameHousehold(page, originalHouseholdName);
  await page.getByText('가구 이름을 변경했어요.', { exact: true }).waitFor();
  await page.getByText(originalHouseholdName, { exact: true }).waitFor();

  if (browserErrors.length > 0) {
    throw new Error(`Browser errors detected:\n${browserErrors.join('\n')}`);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        passed: true,
        checks: [
          'admin household rename',
          'realtime household name update',
          'promote another member',
          'demote another admin',
          'current admin role is not editable',
          'same-household invite guard',
          'original name and role restoration',
          'mobile layout',
        ],
        screenshot: 'qa-artifacts/household-policy-smoke/admin-management.png',
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
  await restoreHouseholdState(page).catch(() => undefined);
  await browser.close();
}

async function openProfile(targetPage) {
  await targetPage.goto(config.appUrl, { waitUntil: 'domcontentloaded' });
  const emailInput = targetPage.getByTestId('auth-email-input');
  const homeScreen = targetPage.getByTestId('home-screen');
  await Promise.race([
    emailInput.waitFor({ state: 'visible', timeout: 15_000 }),
    homeScreen.waitFor({ state: 'visible', timeout: 15_000 }),
  ]);
  if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.fill(config.testEmail);
    await targetPage.getByTestId('auth-password-input').fill(config.testPassword);
    await targetPage.getByTestId('auth-submit-button').click();
  }
  await homeScreen.waitFor({ state: 'visible', timeout: 20_000 });
  await targetPage.getByTestId('profile-open-button').click();
  await targetPage.getByTestId('profile-close-button').waitFor();
}

async function renameHousehold(targetPage, name) {
  await targetPage.getByTestId('profile-household-name-edit-button').click();
  await targetPage.getByTestId('profile-household-name-input').fill(name);
  await targetPage.getByTestId('profile-household-name-save-button').click();
  await targetPage.getByText(name, { exact: true }).waitFor();
}

async function restoreHouseholdState(targetPage) {
  await openProfile(targetPage).catch(() => undefined);
  const demoteButton = targetPage.getByRole('button', { name: /가구원으로 변경$/ }).first();
  if (promotedMember && (await demoteButton.isVisible().catch(() => false))) {
    await demoteButton.click();
    await targetPage.waitForTimeout(1_000);
    promotedMember = false;
  }
  if (!originalHouseholdName) return;
  const currentName = (await targetPage.getByTestId('profile-household-name').textContent())?.trim();
  if (currentName && currentName !== originalHouseholdName) {
    await renameHousehold(targetPage, originalHouseholdName);
  }
}
