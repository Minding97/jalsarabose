import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright-core';

const defaultChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const timeoutMs = 20_000;

export function requiredEnvironment(name, source = process.env) {
  const value = source[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for the browser UI smoke test.`);
  }
  return value;
}

function sameOrigin(value, appUrl) {
  try {
    return new URL(value).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

export function isCriticalConsoleError({ text, sourceUrl }, appUrl) {
  void text;
  return !sourceUrl || sameOrigin(sourceUrl, appUrl);
}

export function isCriticalNetworkFailure({ url, resourceType, reason }, appUrl) {
  if (/ERR_(?:ABORTED|BLOCKED_BY_CLIENT)/i.test(reason)) {
    return false;
  }
  return sameOrigin(url, appUrl) && ['document', 'script', 'stylesheet'].includes(resourceType);
}

export function isCriticalHttpResponse({ url, resourceType, status }, appUrl) {
  return (
    status >= 400 &&
    sameOrigin(url, appUrl) &&
    ['document', 'script', 'stylesheet', 'fetch', 'xhr'].includes(resourceType)
  );
}

function testId(page, value) {
  return page.locator(`[data-testid="${value}"]`);
}

async function expectVisible(page, value) {
  await testId(page, value).waitFor({ state: 'visible', timeout: timeoutMs });
}

async function openTab(page, tab, screen) {
  await testId(page, `tab-${tab}`).click({ timeout: timeoutMs });
  await expectVisible(page, screen);
}

async function inspectForm(page, { addButton, formScreen, fields, closeButton = '뒤로' }) {
  await testId(page, addButton).click({ timeout: timeoutMs });
  if (formScreen) {
    await expectVisible(page, formScreen);
  }
  for (const field of fields) {
    await expectVisible(page, field);
  }
  await page
    .getByRole('button', { name: closeButton, exact: true })
    .click({ timeout: timeoutMs });
}

export async function runAppSmoke({
  appUrl = requiredEnvironment('QA_APP_URL'),
  email = requiredEnvironment('QA_TEST_EMAIL'),
  password = requiredEnvironment('QA_TEST_PASSWORD'),
  chromePath = process.env.QA_CHROME_EXECUTABLE_PATH || defaultChromePath,
} = {}) {
  const runtimeErrors = [];
  const diagnostics = [];
  const completedSteps = [];
  const recordStep = (step) => completedSteps.push(step);
  let browser;
  let page;

  try {
    browser = await chromium.launch({ headless: true, executablePath: chromePath });
    page = await browser.newPage({ viewport: { width: 402, height: 874 } });
    page.on('pageerror', (error) => {
      const detail = `page: ${error.message}`;
      diagnostics.push(detail);
      runtimeErrors.push(detail);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') {
        const detail = `console: ${message.text()}`;
        diagnostics.push(detail);
        if (
          isCriticalConsoleError(
            { text: message.text(), sourceUrl: message.location().url },
            appUrl,
          )
        ) {
          runtimeErrors.push(detail);
        }
      }
    });
    page.on('requestfailed', (request) => {
      const reason = request.failure()?.errorText ?? 'unknown failure';
      const detail = `network: ${request.method()} ${new URL(request.url()).pathname} (${reason})`;
      diagnostics.push(detail);
      if (
        isCriticalNetworkFailure(
          { url: request.url(), resourceType: request.resourceType(), reason },
          appUrl,
        )
      ) {
        runtimeErrors.push(detail);
      }
    });
    page.on('response', (response) => {
      const request = response.request();
      if (
        isCriticalHttpResponse(
          {
            url: response.url(),
            resourceType: request.resourceType(),
            status: response.status(),
          },
          appUrl,
        )
      ) {
        const detail = `http: ${response.status()} ${request.method()} ${new URL(response.url()).pathname}`;
        diagnostics.push(detail);
        runtimeErrors.push(detail);
      }
    });

    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await expectVisible(page, 'auth-email-input');
    await testId(page, 'auth-email-input').fill(email);
    await testId(page, 'auth-password-input').fill(password);
    await testId(page, 'auth-submit-button').click({ timeout: timeoutMs });
    await expectVisible(page, 'home-screen');
    recordStep('login');

    await testId(page, 'profile-open-button').click({ timeout: timeoutMs });
    await expectVisible(page, 'profile-sign-out-button');
    await testId(page, 'profile-close-button').click({ timeout: timeoutMs });
    recordStep('profile');

    await openTab(page, 'calendar', 'calendar-screen');
    await inspectForm(page, {
      addButton: 'calendar-add-button',
      fields: ['calendar-event-title-input', 'calendar-event-time-input'],
      closeButton: '취소',
    });
    recordStep('calendar');

    await openTab(page, 'expenses', 'expenses-screen');
    await inspectForm(page, {
      addButton: 'expense-add-button',
      formScreen: 'expense-form-screen',
      fields: ['expense-title-input', 'expense-amount-input', 'expense-due-date-input'],
    });
    recordStep('expenses');

    await openTab(page, 'chores', 'chores-screen');
    await inspectForm(page, {
      addButton: 'chore-add-button',
      formScreen: 'chore-form-screen',
      fields: ['chore-title-input', 'chore-due-date-input'],
    });
    recordStep('chores');

    await openTab(page, 'fridge', 'fridge-screen');
    await inspectForm(page, {
      addButton: 'fridge-add-button',
      formScreen: 'fridge-form-screen',
      fields: ['fridge-name-input', 'fridge-quantity-input', 'fridge-expiry-date-input'],
    });
    recordStep('fridge');

    await openTab(page, 'home', 'home-screen');
    recordStep('home');

    if (runtimeErrors.length > 0) {
      throw new Error(`Runtime errors detected:\n${runtimeErrors.join('\n')}`);
    }

    return { passed: true, completedSteps, runtimeErrors, diagnostics };
  } catch (error) {
    const artifactDirectory =
      process.env.QA_ARTIFACTS_DIR || resolve(process.cwd(), 'qa-artifacts');
    const screenshotPath = resolve(artifactDirectory, 'app-smoke-failure.png');
    if (page) {
      mkdirSync(artifactDirectory, { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
    }
    throw new Error(
      JSON.stringify(
        {
          message: error instanceof Error ? error.message : String(error),
          completedSteps,
          runtimeErrors,
          diagnostics,
          screenshotArtifact: page ? 'app-smoke-failure.png' : null,
          currentUrl: page?.url() ?? appUrl,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAppSmoke()
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
