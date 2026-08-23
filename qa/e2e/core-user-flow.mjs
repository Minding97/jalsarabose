import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright-core';

import { resolveChromeExecutablePath } from '../automation/browser.mjs';
import { loadQaConfig } from '../server/config.mjs';

const qaPassword = 'qa-only-passphrase';

async function navigateTab(page, label) {
  const tab = page.locator('[role="tab"]').filter({ hasText: label });
  await assertVisible(tab, `${label} tab`);
  await tab.click();
}

async function assertVisible(locator, label) {
  await locator.first().waitFor({ state: 'visible', timeout: 10_000 });
  assert.ok((await locator.count()) > 0, `${label} is missing`);
}

async function signUp(page, { displayName, email }) {
  await page.getByTestId('auth-mode-toggle-button').click();
  await page.getByTestId('auth-display-name-input').fill(displayName);
  await page.getByTestId('auth-email-input').fill(email);
  await page.getByTestId('auth-password-input').fill(qaPassword);
  await page.getByTestId('auth-submit-button').click();
  await assertVisible(page.getByTestId('household-name-input'), 'household setup');
}

async function signIn(page, email) {
  await page.getByTestId('auth-email-input').fill(email);
  await page.getByTestId('auth-password-input').fill(qaPassword);
  await page.getByTestId('auth-submit-button').click();
  await assertVisible(page.getByTestId('home-screen'), 'home after sign in');
}

async function signOut(page) {
  await page.getByTestId('profile-open-button').click();
  await page.getByTestId('profile-sign-out-button').click();
  await assertVisible(page.getByTestId('auth-email-input'), 'auth screen after sign out');
}

async function testOnboardingAndInvite(page) {
  const ownerEmail = 'owner@e2e.invalid';
  const memberEmail = 'member@e2e.invalid';

  await signUp(page, { displayName: 'Owner QA', email: ownerEmail });
  await page.getByTestId('household-name-input').fill('QA Household');
  await page.getByTestId('household-create-button').click();
  await page.getByTestId('household-create-confirm-button').click();
  await assertVisible(page.getByTestId('home-screen'), 'owner home');

  await page.getByTestId('profile-open-button').click();
  const inviteCode = (await page.getByTestId('profile-invite-code').textContent())?.trim() ?? '';
  assert.match(inviteCode, /^[A-Z0-9]{6,8}$/, 'a valid invite code should be displayed');
  await page.getByTestId('profile-sign-out-button').click();

  await signUp(page, { displayName: 'Member QA', email: memberEmail });
  await page.getByTestId('household-invite-code-input').fill(inviteCode);
  await page.getByTestId('household-join-button').click();
  await assertVisible(page.getByTestId('home-screen'), 'joined member home');
  await assertVisible(page.getByText('Owner QA', { exact: true }), 'owner member chip');
  await assertVisible(page.getByText('Member QA', { exact: true }), 'joined member chip');

  await signOut(page);
  await signIn(page, ownerEmail);
  await assertVisible(page.getByText('Member QA', { exact: true }), 'realtime joined member for owner');
}

async function testMonthlyBudgetAndExpenseCrud(page) {
  await navigateTab(page, '지출');
  await assertVisible(page.getByTestId('expenses-screen'), 'expenses screen');

  await page.getByRole('button', { name: '지출 보기: 대시보드' }).click();
  await page.getByTestId('monthly-budget-edit-button').click();
  await page.getByTestId('monthly-budget-total-input').fill('1200000');
  await page.getByTestId('monthly-budget-submit-button').click();
  await assertVisible(page.getByText('1,200,000원', { exact: true }), 'created monthly budget');

  await page.getByTestId('monthly-budget-edit-button').click();
  await page.getByTestId('monthly-budget-total-input').fill('1400000');
  await page.getByTestId('monthly-budget-submit-button').click();
  await assertVisible(page.getByText('1,400,000원', { exact: true }), 'updated monthly budget');

  await page.getByRole('button', { name: '지출 보기: 목록' }).click();
  await page.getByTestId('expense-add-button').click();
  await page.getByTestId('expense-amount-input').fill('32000');
  await page.getByTestId('expense-title-input').fill('E2E Expense');
  await page.getByTestId('expense-submit-button').click();
  await assertVisible(page.getByText('E2E Expense', { exact: true }), 'created expense');

  await page.getByText('E2E Expense', { exact: true }).click();
  await page.getByTestId('expense-title-input').fill('E2E Expense Updated');
  await page.getByTestId('expense-submit-button').click();
  await assertVisible(page.getByText('E2E Expense Updated', { exact: true }), 'updated expense');

  await page.getByText('E2E Expense Updated', { exact: true }).click();
  await page.getByTestId('expense-delete-button').click();
  await assertHidden(page.getByText('E2E Expense Updated', { exact: true }), 'deleted expense');
}

async function testFridgeCrud(page) {
  await navigateTab(page, '냉장고');
  await assertVisible(page.getByTestId('fridge-screen'), 'fridge screen');
  await page.getByTestId('fridge-add-button').click();
  await page.getByTestId('fridge-name-input').fill('E2E Milk');
  await page.getByTestId('fridge-quantity-input').fill('1 pack');
  await page.getByTestId('fridge-submit-button').click();
  await assertVisible(page.getByText('E2E Milk', { exact: true }), 'created fridge item');

  await page.getByText('E2E Milk', { exact: true }).click();
  await page.getByTestId('fridge-name-input').fill('E2E Milk Updated');
  await page.getByTestId('fridge-submit-button').click();
  await assertVisible(page.getByText('E2E Milk Updated', { exact: true }), 'updated fridge item');

  await page.getByText('E2E Milk Updated', { exact: true }).click();
  await page.getByTestId('fridge-delete-button').click();
  await assertHidden(page.getByText('E2E Milk Updated', { exact: true }), 'deleted fridge item');
}

async function testCalendarLifecycle(page) {
  await navigateTab(page, '캘린더');
  await assertVisible(page.getByTestId('calendar-screen'), 'calendar screen');
  await page.getByTestId('calendar-add-button').click();
  await page.getByTestId('calendar-event-title-input').fill('E2E Calendar Event');
  await page.getByTestId('calendar-event-time-input').fill('19:00');
  await page.getByTestId('calendar-event-save-button').click();
  await assertVisible(page.getByText('E2E Calendar Event', { exact: true }), 'created calendar event');
  await page.getByRole('button', { name: 'E2E Calendar Event 삭제' }).click();
  await assertHidden(page.getByText('E2E Calendar Event', { exact: true }), 'deleted calendar event');
}

async function assertHidden(locator, label) {
  await locator.first().waitFor({ state: 'detached', timeout: 10_000 }).catch(async () => {
    await locator.first().waitFor({ state: 'hidden', timeout: 1_000 });
  });
  assert.equal(await locator.count(), 0, `${label} is still present`);
}

export async function findUnnamedInteractiveElements(page) {
  return page.locator('button, input, textarea, select, [role="button"], [role="tab"], [role="checkbox"], [role="switch"]').evaluateAll(
    (elements) =>
      elements
        .filter((element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
        })
        .filter((element) => {
          const labelledBy = element.getAttribute('aria-labelledby');
          const labelledText = labelledBy
            ? labelledBy
                .split(/\s+/)
                .map((id) => document.getElementById(id)?.textContent ?? '')
                .join(' ')
            : '';
          return ![
            element.getAttribute('aria-label'),
            labelledText,
            element.getAttribute('title'),
            element.textContent,
          ].some((value) => value?.trim());
        })
        .map((element) => element.outerHTML.slice(0, 300)),
  );
}

async function testPlatformsOfflineAndAccessibility(page) {
  for (const width of [320, 402, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 874 });
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    assert.equal(hasHorizontalOverflow, false, `${width}px viewport has horizontal overflow`);
    await assertVisible(page.getByTestId('calendar-screen'), `calendar at ${width}px`);
  }

  const unnamed = await findUnnamedInteractiveElements(page);
  assert.deepEqual(unnamed, [], `interactive elements without accessible names:\n${unnamed.join('\n')}`);

  await page.context().setOffline(true);
  await assertVisible(page.getByTestId('offline-status-banner'), 'offline status');
  await page.context().setOffline(false);
  await page.getByTestId('offline-status-banner').waitFor({ state: 'detached', timeout: 10_000 });
}

export async function runCoreUserFlow({ appUrl, executablePath }) {
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ viewport: { width: 402, height: 874 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  try {
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
    await assertVisible(page.getByTestId('auth-email-input'), 'E2E auth entry');
    await testOnboardingAndInvite(page);
    await testMonthlyBudgetAndExpenseCrud(page);
    await testFridgeCrud(page);
    await testCalendarLifecycle(page);
    await testPlatformsOfflineAndAccessibility(page);
    assert.deepEqual(pageErrors, [], `browser page errors:\n${pageErrors.join('\n')}`);
    return {
      passed: true,
      flows: ['auth-household-invite', 'monthly-budget-expense', 'fridge', 'calendar'],
      viewports: [320, 402, 1440],
      offline: true,
      accessibility: true,
    };
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadQaConfig();
  const result = await runCoreUserFlow({
    appUrl: process.env.QA_APP_URL ?? config.appUrl,
    executablePath: resolveChromeExecutablePath(config.chromeExecutablePath),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
