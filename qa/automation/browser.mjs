import { existsSync } from 'node:fs';

const knownChromePaths = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/opt/google/chrome/chrome',
];

export function resolveChromeExecutablePath(preferredPath, pathExists = existsSync) {
  const candidates = [preferredPath, ...knownChromePaths].filter(Boolean);
  const executablePath = candidates.find((candidate, index) => {
    return candidates.indexOf(candidate) === index && pathExists(candidate);
  });

  if (!executablePath) {
    throw new Error(
      'Chrome or Chromium was not found. Set QA_CHROME_EXECUTABLE_PATH to a local browser executable.',
    );
  }
  return executablePath;
}
