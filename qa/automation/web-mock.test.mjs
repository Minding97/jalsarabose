import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'));
const require = createRequire(import.meta.url);
const expoPackageDirectory = dirname(require.resolve('expo/package.json'));
const expoEnvPath = require.resolve('@expo/env', { paths: [expoPackageDirectory] });

function parseInlineEnvironment(command) {
  const tokens = command.trim().split(/\s+/);
  const environment = {};

  while (tokens[0]?.includes('=')) {
    const token = tokens.shift();
    const separatorIndex = token.indexOf('=');
    environment[token.slice(0, separatorIndex)] = token.slice(separatorIndex + 1);
  }

  return { environment, command: tokens.join(' ') };
}

test('web:mock ignores .env.local and always enables sample data', () => {
  const parsed = parseInlineEnvironment(packageJson.scripts['web:mock']);
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'jalsarabose-web-mock-'));
  writeFileSync(join(fixtureRoot, '.env.local'), 'EXPO_PUBLIC_USE_MOCKS=false\n');

  const environment = { ...process.env, ...parsed.environment };
  delete environment.__EXPO_ENV_LOADED;

  const probe = `
    const expoEnv = require(${JSON.stringify(expoEnvPath)});
    const result = expoEnv.loadProjectEnv(process.cwd(), { force: true, silent: true });
    process.stdout.write(JSON.stringify({
      dotenvEnabled: expoEnv.isEnabled(),
      files: result.files ?? [],
      useMocks: process.env.EXPO_PUBLIC_USE_MOCKS,
    }));
  `;

  try {
    const result = spawnSync(process.execPath, ['-e', probe], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      env: environment,
    });

    assert.equal(parsed.command, 'expo start --web');
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      dotenvEnabled: false,
      files: [],
      useMocks: 'true',
    });
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('static mock export uses the same isolated environment', () => {
  const parsed = parseInlineEnvironment(packageJson.scripts['export:web:mock']);

  assert.equal(parsed.environment.EXPO_NO_DOTENV, '1');
  assert.equal(parsed.environment.EXPO_PUBLIC_USE_MOCKS, 'true');
});
