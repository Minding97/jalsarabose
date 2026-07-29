import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const launchAgentsDirectory = resolve(homedir(), 'Library/LaunchAgents');
const stateDirectory = resolve(homedir(), '.local/state/jalsarabose');
const plistPath = resolve(
  launchAgentsDirectory,
  'com.jalsarabose.qa-nightly.plist',
);
const uid = process.getuid();
const domain = `gui/${uid}`;
const label = 'com.jalsarabose.qa-nightly';
const pathValue = [
  resolve(homedir(), '.local/bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
].join(':');

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${resolve(repositoryRoot, 'qa/automation/nightly-runner.mjs')}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${repositoryRoot}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${pathValue}</string>
    <key>CODEX_CLI_PATH</key>
    <string>/Applications/ChatGPT.app/Contents/Resources/codex</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>0</integer>
    <key>Minute</key>
    <integer>30</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${resolve(stateDirectory, 'qa-nightly.log')}</string>
  <key>StandardErrorPath</key>
  <string>${resolve(stateDirectory, 'qa-nightly-error.log')}</string>
</dict>
</plist>
`;

mkdirSync(launchAgentsDirectory, { recursive: true });
mkdirSync(stateDirectory, { recursive: true });
writeFileSync(plistPath, plist, { mode: 0o600 });

spawnSync('launchctl', ['bootout', domain, plistPath], { stdio: 'ignore' });
const result = spawnSync('launchctl', ['bootstrap', domain, plistPath], {
  encoding: 'utf8',
});

if (result.status !== 0) {
  console.error(result.stderr || `Failed to load ${plistPath}`);
  process.exit(result.status ?? 1);
}

console.log(`Installed nightly QA schedule: ${plistPath}`);
console.log('Runs every day at 00:30 KST and processes the queue until 07:00.');

