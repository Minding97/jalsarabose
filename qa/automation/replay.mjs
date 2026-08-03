import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright-core';

import { loadQaConfig } from '../server/config.mjs';

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    result[argv[index]?.replace(/^--/, '')] = argv[index + 1];
  }
  return result;
}

function parseScroll(detail = '') {
  const match = detail.match(/x=(-?\d+(?:\.\d+)?),y=(-?\d+(?:\.\d+)?)/);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

function getStepLocator(page, selector) {
  const roleMatch = selector?.match(/^role=([^|]+)\|name=(.+)$/);
  if (roleMatch) {
    return page.getByRole(roleMatch[1], { name: JSON.parse(roleMatch[2]) });
  }
  return page.locator(selector);
}

export async function replayRecording({
  recordingPath,
  appUrl,
  outputPath,
  screenshotPath,
}) {
  const config = loadQaConfig();
  const recording = JSON.parse(readFileSync(recordingPath, 'utf8'));
  const browser = await chromium.launch({
    headless: true,
    executablePath: config.chromeExecutablePath,
  });
  const page = await browser.newPage({
    viewport: { width: 402, height: 874 },
  });
  const errors = [];
  const failedSteps = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push({ type: 'console', message: message.text().slice(0, 2000) });
    }
  });
  page.on('requestfailed', (request) => {
    errors.push({
      type: 'network',
      message: `${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText}`,
    });
  });

  try {
    await page.goto(appUrl || config.appUrl, { waitUntil: 'domcontentloaded' });
    const firstInteractiveStep = (recording.steps ?? []).find((step) =>
      ['click', 'input', 'submit'].includes(step.action),
    );
    const startsWithLogin = firstInteractiveStep?.selector?.includes('auth-email-input');
    if (!startsWithLogin && config.testEmail && config.testPassword) {
      const emailInput = page.locator('[data-testid="auth-email-input"]');
      const passwordInput = page.locator('[data-testid="auth-password-input"]');
      const submitButton = page.locator('[data-testid="auth-submit-button"]');
      await emailInput.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
      if ((await emailInput.count()) === 1 && (await passwordInput.count()) === 1) {
        await emailInput.fill(config.testEmail);
        await passwordInput.fill(config.testPassword);
        await submitButton.click();
        await emailInput.waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
      }
    }

    for (const step of recording.steps ?? []) {
      if (!step.selector && !['scroll', 'navigation'].includes(step.action)) {
        continue;
      }

      try {
        if (step.action === 'click' || step.action === 'submit') {
          await getStepLocator(page, step.selector).first().click({ timeout: 5000 });
        } else if (step.action === 'input') {
          await getStepLocator(page, step.selector)
            .first()
            .fill(step.value ?? '', { timeout: 5000 });
        } else if (step.action === 'scroll') {
          const position = parseScroll(step.detail);
          if (position) {
            await page.evaluate(({ x, y }) => window.scrollTo(x, y), position);
          }
        } else if (step.action === 'navigation') {
          await page.waitForTimeout(250);
        }
      } catch (error) {
        failedSteps.push({
          sequence: step.sequence,
          action: step.action,
          selector: step.selector,
          message: error instanceof Error ? error.message.slice(0, 2000) : String(error),
        });
      }
    }

    if (screenshotPath) {
      mkdirSync(dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
  } finally {
    await browser.close();
  }

  const result = {
    recordingPath,
    appUrl: appUrl || config.appUrl,
    executedSteps: recording.steps?.length ?? 0,
    failedSteps,
    errors,
    passed: failedSteps.length === 0,
    completedAt: new Date().toISOString(),
  };

  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  }

  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArguments(process.argv.slice(2));
  if (!args.recording) {
    console.error(
      'Usage: node qa/automation/replay.mjs --recording FILE [--url URL] [--output FILE] [--screenshot FILE]',
    );
    process.exit(1);
  }

  const recordingPath = resolve(args.recording);
  const result = await replayRecording({
    recordingPath,
    appUrl: args.url,
    outputPath: args.output ? resolve(args.output) : undefined,
    screenshotPath: args.screenshot ? resolve(args.screenshot) : undefined,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.passed ? 0 : 2);
}
