import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { reviewWithCodex } from './codex-review.mjs';

test('reviews an exact isolated diff and copies a schema-validated result', async (context) => {
  const root = mkdtempSync(resolve(tmpdir(), 'codex-review-test-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'QA Test'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'qa@example.invalid'], { cwd: root });
  writeFileSync(resolve(root, 'tracked.txt'), 'base\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '--quiet', '-m', 'base'], { cwd: root });
  execFileSync('git', ['branch', 'origin/main'], { cwd: root });
  writeFileSync(resolve(root, 'tracked.txt'), 'changed\n');
  execFileSync('git', ['commit', '--quiet', '-am', 'change'], { cwd: root });
  const fake = resolve(root, 'fake-codex');
  writeFileSync(fake, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const cwd = args[args.indexOf('-C') + 1];
if (!fs.readFileSync(cwd + '/.claude-review.diff', 'utf8').includes('+changed')) process.exit(2);
fs.writeFileSync(args[args.indexOf('-o') + 1], JSON.stringify({summary:'clean',findings:[]}));
`);
  chmodSync(fake, 0o700);
  const previous = process.env.CODEX_CLI_PATH;
  process.env.CODEX_CLI_PATH = fake;
  try {
    const output = resolve(root, 'review.json');
    const review = await reviewWithCodex({ worktree: root, issueKey: 'JAL-1', pullRequestNumber: 57, outputPath: output });
    assert.deepEqual(review, { summary: 'clean', findings: [] });
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), review);
  } finally {
    if (previous === undefined) delete process.env.CODEX_CLI_PATH;
    else process.env.CODEX_CLI_PATH = previous;
  }
});
