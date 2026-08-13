import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  buildReviewEnvironment,
  reviewWithClaude,
  verifyClaudeCompatibility,
} from './claude-review.mjs';

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

test('removes QA and infrastructure credentials from the review environment', () => {
  const environment = buildReviewEnvironment({
    PATH: '/usr/bin',
    JIRA_API_TOKEN: 'jira-secret',
    QA_TEST_PASSWORD: 'qa-secret',
    GITHUB_TOKEN: 'github-secret',
    EXPO_PUBLIC_FIREBASE_API_KEY: 'firebase-secret',
  });

  assert.deepEqual(environment, { PATH: '/usr/bin' });
});

test('rejects Claude CLIs with missing isolation flags or an outdated version', async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'jalsarabose-claude-version-test-'));
  const missingFlagCli = join(fixtureRoot, 'missing-flag.mjs');
  const outdatedCli = join(fixtureRoot, 'outdated.mjs');
  const environment = buildReviewEnvironment();

  try {
    writeFileSync(
      missingFlagCli,
      [
        '#!/usr/bin/env node',
        "process.stdout.write(process.argv.includes('--help') ? '--tools --no-session-persistence' : '2.1.220');",
      ].join('\n'),
    );
    writeFileSync(
      outdatedCli,
      [
        '#!/usr/bin/env node',
        "process.stdout.write(process.argv.includes('--help') ? '--tools --safe-mode --no-session-persistence' : '2.1.219');",
      ].join('\n'),
    );
    chmodSync(missingFlagCli, 0o755);
    chmodSync(outdatedCli, 0o755);

    await assert.rejects(
      verifyClaudeCompatibility(missingFlagCli, environment),
      /missing required review flags/,
    );
    await assert.rejects(
      verifyClaudeCompatibility(outdatedCli, environment),
      /2\.1\.220 or newer is required/,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('reviews a tracked-only clone with bounded noninteractive settings', async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'jalsarabose-claude-review-test-'));
  const remote = join(fixtureRoot, 'remote.git');
  const repository = join(fixtureRoot, 'repository');
  const linkedWorktree = join(fixtureRoot, 'linked-worktree');
  const fakeClaude = join(fixtureRoot, 'fake-claude.mjs');
  const invocationPath = join(fixtureRoot, 'invocation.json');
  const outputPath = join(fixtureRoot, 'review.json');
  const previousClaudePath = process.env.CLAUDE_CLI_PATH;
  const previousPassword = process.env.QA_TEST_PASSWORD;

  try {
    runGit(fixtureRoot, ['init', '--bare', '--quiet', '--initial-branch=main', remote]);
    runGit(fixtureRoot, ['clone', '--quiet', remote, repository]);
    runGit(repository, ['config', 'user.email', 'qa@example.com']);
    runGit(repository, ['config', 'user.name', 'QA']);
    writeFileSync(join(repository, 'tracked.txt'), 'tracked\n');
    runGit(repository, ['add', 'tracked.txt']);
    runGit(repository, ['commit', '--quiet', '-m', 'initial']);
    runGit(repository, ['push', '--quiet', '-u', 'origin', 'main']);
    runGit(repository, ['switch', '--quiet', '-c', 'feature']);
    writeFileSync(
      join(repository, 'tracked.txt'),
      `start-marker\n${'x'.repeat(2.2 * 1024 * 1024)}\nend-marker\n`,
    );
    runGit(repository, ['add', 'tracked.txt']);
    runGit(repository, ['commit', '--quiet', '-m', 'feature']);
    runGit(repository, ['push', '--quiet', '-u', 'origin', 'feature']);
    runGit(repository, ['branch', '-D', 'main']);
    runGit(repository, [
      'worktree',
      'add',
      '--quiet',
      '-b',
      'automation-review',
      linkedWorktree,
      'feature',
    ]);
    writeFileSync(join(linkedWorktree, '.env.local'), 'QA_TEST_PASSWORD=secret\n');
    mkdirSync(join(linkedWorktree, 'node_modules'));

    writeFileSync(
      fakeClaude,
      [
        '#!/usr/bin/env node',
        "import { existsSync, readFileSync, writeFileSync } from 'node:fs';",
        "if (process.argv.includes('--help')) {",
        "  process.stdout.write('--tools --permission-mode --safe-mode --no-session-persistence');",
        '  process.exit(0);',
        '}',
        "if (process.argv.includes('--version')) {",
        "  process.stdout.write('2.1.220 (Claude Code)');",
        '  process.exit(0);',
        '}',
        "const diff = readFileSync('.claude-review.diff', 'utf8');",
        'const payload = {',
        '  args: process.argv.slice(2),',
        '  cwd: process.cwd(),',
        "  envFileVisible: existsSync('.env.local'),",
        "  diffVisible: existsSync('.claude-review.diff'),",
        "  diffContainsStart: diff.includes('start-marker'),",
        "  diffContainsEnd: diff.includes('end-marker'),",
        '  diffSize: Buffer.byteLength(diff),',
        "  nodeModulesVisible: existsSync('node_modules'),",
        '  passwordVisible: Boolean(process.env.QA_TEST_PASSWORD),',
        '};',
        `writeFileSync(${JSON.stringify(invocationPath)}, JSON.stringify(payload));`,
        "const review = { summary: 'Authorization: Bearer claude-primary-secret AKIAIOSFODNN7EXAMPLE', findings: [{ severity: 'P3', title: 'token=title-secret', evidence: 'password=evidence-secret postgres://db-user:db-password@db.example.com/app', file: 'safe.mjs', line: 1, acceptanceCriteria: 'api_key=acceptance-secret -----BEGIN PRIVATE KEY-----\\nprivate-material\\n-----END PRIVATE KEY-----', fingerprint: 'sk-abcdefghijklmnop' }] };",
        "process.stdout.write(JSON.stringify({ padding: 'x'.repeat(2.2 * 1024 * 1024), result: JSON.stringify(review) }));",
      ].join('\n'),
    );
    chmodSync(fakeClaude, 0o755);

    process.env.CLAUDE_CLI_PATH = fakeClaude;
    process.env.QA_TEST_PASSWORD = 'secret';

    const review = await reviewWithClaude({
      worktree: linkedWorktree,
      issueKey: 'JAL-26',
      pullRequestNumber: 8,
      outputPath,
    });
    const invocation = JSON.parse(readFileSync(invocationPath, 'utf8'));
    const maxTurnsIndex = invocation.args.indexOf('--max-turns');
    const permissionModeIndex = invocation.args.indexOf('--permission-mode');

    const serializedReview = JSON.stringify(review);
    const persistedReview = readFileSync(outputPath, 'utf8');
    assert.doesNotMatch(serializedReview, /claude-primary-secret|title-secret|evidence-secret|acceptance-secret|abcdefghijklmnop|AKIAIOSFODNN7EXAMPLE|db-password|private-material/);
    assert.doesNotMatch(persistedReview, /claude-primary-secret|title-secret|evidence-secret|acceptance-secret|abcdefghijklmnop|AKIAIOSFODNN7EXAMPLE|db-password|private-material/);
    assert.match(serializedReview, /REDACTED/);
    assert.equal(invocation.args[maxTurnsIndex + 1], '24');
    assert.equal(invocation.args[permissionModeIndex + 1], 'dontAsk');
    assert.equal(invocation.args.includes('--safe-mode'), true);
    assert.equal(invocation.args.includes('--no-session-persistence'), true);
    assert.equal(invocation.args.includes('--tools'), true);
    assert.equal(invocation.args.includes('Read,Glob,Grep'), true);
    assert.equal(invocation.args.join(' ').includes('Bash('), false);
    assert.equal(invocation.envFileVisible, false);
    assert.equal(invocation.diffVisible, true);
    assert.equal(invocation.diffContainsStart, true);
    assert.equal(invocation.diffContainsEnd, true);
    assert.equal(invocation.diffSize > 2 * 1024 * 1024, true);
    assert.equal(invocation.nodeModulesVisible, false);
    assert.equal(invocation.passwordVisible, false);
    assert.equal(existsSync(invocation.cwd), false);
  } finally {
    if (previousClaudePath === undefined) delete process.env.CLAUDE_CLI_PATH;
    else process.env.CLAUDE_CLI_PATH = previousClaudePath;
    if (previousPassword === undefined) delete process.env.QA_TEST_PASSWORD;
    else process.env.QA_TEST_PASSWORD = previousPassword;
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
