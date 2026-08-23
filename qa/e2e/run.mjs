import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withExpoWebServer } from '../automation/app-server.mjs';
import { resolveChromeExecutablePath } from '../automation/browser.mjs';
import { loadQaConfig } from '../server/config.mjs';
import { runCoreUserFlow } from './core-user-flow.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const config = loadQaConfig();

const result = await withExpoWebServer(
  {
    worktree: repositoryRoot,
    port: config.replayPort,
    env: {
      EXPO_PUBLIC_USE_MOCKS: 'true',
      EXPO_PUBLIC_QA_E2E: 'true',
    },
  },
  (appUrl) =>
    runCoreUserFlow({
      appUrl,
      executablePath: resolveChromeExecutablePath(config.chromeExecutablePath),
    }),
);

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
