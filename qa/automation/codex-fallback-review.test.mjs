import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { reviewWithCodexFallback } from './codex-fallback-review.mjs';

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('reviewWithCodexFallback runs the isolated CLI end to end and redacts persisted evidence', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-fallback-e2e-'));
  const repository = join(root, 'repository');
  const cli = join(root, 'codex');
  const output = join(root, 'evidence.json');
  try {
    git(root, ['init', '--quiet', '--initial-branch=main', repository]);
    git(repository, ['config', 'user.email', 'qa@example.com']);
    git(repository, ['config', 'user.name', 'QA']);
    writeFileSync(join(repository, 'tracked.txt'), 'base\n');
    git(repository, ['add', 'tracked.txt']);
    git(repository, ['commit', '--quiet', '-m', 'base']);
    const base = git(repository, ['rev-parse', 'HEAD']);
    git(repository, ['update-ref', 'refs/remotes/origin/main', base]);
    git(repository, ['switch', '--quiet', '-c', 'feature']);
    writeFileSync(join(repository, 'tracked.txt'), 'feature\n');
    git(repository, ['commit', '--quiet', '-am', 'feature']);

    writeFileSync(cli, [
      '#!/usr/bin/env node',
      "import { writeFileSync } from 'node:fs';",
      "if (process.argv[2] === 'exec' && process.argv.includes('--help')) { process.stdout.write('--model --config --sandbox --ephemeral --ignore-user-config --ignore-rules --output-schema --output-last-message --cd'); process.exit(0); }",
      "if (process.argv[2] === 'login') { process.stdout.write('Logged in using ChatGPT'); process.exit(0); }",
      "if (process.argv[2] === '--version') { process.stdout.write('codex-cli 1.0.0'); process.exit(0); }",
      "const outputIndex = process.argv.indexOf('--output-last-message');",
      "writeFileSync(process.argv[outputIndex + 1], JSON.stringify({ summary: 'Bearer fallback-secret', findings: [{ severity: 'P2', title: 'token=title-secret', evidence: 'password=evidence-secret', file: 'tracked.txt', line: 1, acceptanceCriteria: 'api_key=acceptance-secret', fingerprint: 'ghp_abcdefghijklmnop' }] }));",
    ].join('\n'));
    chmodSync(cli, 0o755);

    const evidence = await reviewWithCodexFallback({
      worktree: repository, issueKey: 'JAL-1', pullRequestNumber: 21,
      outputPath: output, reasonCode: 'claude_http_429', codexPath: cli,
    });
    assert.equal(evidence.result.findings[0].severity, 'P2');
    for (const serialized of [JSON.stringify(evidence), readFileSync(output, 'utf8')]) {
      assert.doesNotMatch(serialized, /fallback-secret|title-secret|evidence-secret|acceptance-secret|abcdefghijklmnop/);
      assert.match(serialized, /REDACTED/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reviewWithCodexFallback fails closed before invocation for non-quota Claude failures', async () => {
  let invoked = false;
  await assert.rejects(reviewWithCodexFallback({
    worktree: '.', issueKey: 'JAL-1', pullRequestNumber: 21,
    reasonCode: 'claude_authentication', runner: async () => { invoked = true; },
  }), /verified Claude quota reason code/);
  assert.equal(invoked, false);
});
