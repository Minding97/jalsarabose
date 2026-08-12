import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { loadQaConfig } from '../server/config.mjs';

const sourceRepositoryRoot = resolve(import.meta.dirname, '../..');
const launchAgentsDirectory = resolve(homedir(), 'Library/LaunchAgents');
const stateDirectory = resolve(homedir(), '.local/state/jalsarabose');
const automationRoot = resolve(homedir(), '.local/share/jalsarabose/automation-main');
const uid = process.getuid();
const domain = `gui/${uid}`;
const pathValue = [
  resolve(homedir(), '.local/bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
].join(':');

export function resolveNodeExecutable() {
  const stableHomebrewPath = '/opt/homebrew/bin/node';
  return existsSync(stableHomebrewPath) ? stableHomebrewPath : process.execPath;
}

export function resolveClaudeExecutable(
  pathExists = existsSync,
  candidates = ['/opt/homebrew/bin/claude', '/usr/local/bin/claude'],
) {
  for (const candidate of candidates) {
    if (pathExists(candidate)) return candidate;
  }
  throw new Error('A current Claude CLI is required at a supported stable path.');
}

export function resolveOpenClawExecutable(
  pathExists = existsSync,
  candidates = [resolve(homedir(), 'Library/pnpm/openclaw'), '/opt/homebrew/bin/openclaw', '/usr/local/bin/openclaw'],
) {
  for (const candidate of candidates) {
    if (pathExists(candidate)) return candidate;
  }
  throw new Error('OpenClaw CLI is required for scheduled Telegram completion notifications.');
}

export function validateScheduleConfig(config) {
  if (!config.telegramTarget) {
    throw new Error('Set QA_TELEGRAM_TARGET before installing required completion notifications.');
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function buildLaunchAgentPlist({
  label,
  scriptPath,
  workingDirectory,
  hour,
  minute,
  stdoutPath,
  stderrPath,
  nodeExecutable = resolveNodeExecutable(),
  claudeExecutable = resolveClaudeExecutable(),
  openclawExecutable = resolveOpenClawExecutable(),
}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(nodeExecutable)}</string>
    <string>${escapeXml(scriptPath)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(workingDirectory)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${escapeXml(pathValue)}</string>
    <key>CODEX_CLI_PATH</key>
    <string>/Applications/ChatGPT.app/Contents/Resources/codex</string>
    <key>CLAUDE_CLI_PATH</key>
    <string>${escapeXml(claudeExecutable)}</string>
    <key>OPENCLAW_CLI_PATH</key>
    <string>${escapeXml(openclawExecutable)}</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${escapeXml(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(stderrPath)}</string>
</dict>
</plist>
`;
}

function runChecked(command, args, cwd = sourceRepositoryRoot) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || `${command} ${args.join(' ')} failed.`);
  }
  return result;
}

function prepareAutomationCheckout() {
  if (sourceRepositoryRoot === automationRoot) {
    return automationRoot;
  }

  mkdirSync(resolve(automationRoot, '..'), { recursive: true });
  runChecked('git', ['fetch', 'origin', 'main']);
  spawnSync('git', ['worktree', 'remove', '--force', automationRoot], {
    cwd: sourceRepositoryRoot,
    stdio: 'ignore',
  });
  rmSync(automationRoot, { recursive: true, force: true });
  runChecked('git', ['worktree', 'prune']);
  runChecked('git', ['worktree', 'add', '--detach', automationRoot, 'origin/main']);

  const sourceEnv = resolve(sourceRepositoryRoot, '.env.local');
  if (existsSync(sourceEnv)) {
    copyFileSync(sourceEnv, resolve(automationRoot, '.env.local'));
    chmodSync(resolve(automationRoot, '.env.local'), 0o600);
  }
  runChecked('npm', ['ci', '--ignore-scripts'], automationRoot);
  return automationRoot;
}

function installAgent({ label, filename, script, hour, minute, logPrefix }, root) {
  const plistPath = resolve(launchAgentsDirectory, filename);
  const plist = buildLaunchAgentPlist({
    label,
    scriptPath: resolve(root, script),
    workingDirectory: root,
    hour,
    minute,
    stdoutPath: resolve(stateDirectory, `${logPrefix}.log`),
    stderrPath: resolve(stateDirectory, `${logPrefix}-error.log`),
  });

  writeFileSync(plistPath, plist, { mode: 0o600 });
  spawnSync('launchctl', ['bootout', domain, plistPath], { stdio: 'ignore' });
  const result = spawnSync('launchctl', ['bootstrap', domain, plistPath], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `Failed to load ${plistPath}`);
  }
  return plistPath;
}

export function installSchedules() {
  const config = loadQaConfig();
  validateScheduleConfig(config);
  mkdirSync(launchAgentsDirectory, { recursive: true });
  mkdirSync(stateDirectory, { recursive: true });
  const root = prepareAutomationCheckout();
  const nightlyPath = installAgent(
    {
      label: 'com.jalsarabose.qa-nightly',
      filename: 'com.jalsarabose.qa-nightly.plist',
      script: 'qa/automation/nightly-runner.mjs',
      hour: 0,
      minute: 30,
      logPrefix: 'qa-nightly',
    },
    root,
  );
  const dailyPath = installAgent(
    {
      label: 'com.jalsarabose.qa-daily',
      filename: 'com.jalsarabose.qa-daily.plist',
      script: 'qa/automation/daily-regression.mjs',
      hour: config.dailyQaHour,
      minute: config.dailyQaMinute,
      logPrefix: 'qa-daily',
    },
    root,
  );

  console.log(`Installed nightly QA schedule: ${nightlyPath}`);
  console.log(`Installed daily regression schedule: ${dailyPath}`);
  console.log(
    `Nightly fixes run at 00:30; merged-main regression runs at ${String(config.dailyQaHour).padStart(2, '0')}:${String(config.dailyQaMinute).padStart(2, '0')} KST.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    installSchedules();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
