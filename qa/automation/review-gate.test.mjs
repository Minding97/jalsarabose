import assert from 'node:assert/strict';
import test from 'node:test';

import { ClaudeReviewFailure, classifyClaudeFailure } from './claude-review.mjs';
import { buildCodexExecArguments, redactReviewEvidence, redactReviewValue,
  verifyCodexAuthentication, verifyCodexCompatibility } from './codex-fallback-review.mjs';
import { finalizeReviewGate, runReviewGate } from './review-gate.mjs';

test('only exact structured 429 and quota codes authorize fallback', () => {
  assert.deepEqual(classifyClaudeFailure({ exitCode: 1, stdout: '{"status":429}' }), { eligible: true, reasonCode: 'claude_http_429' });
  assert.deepEqual(classifyClaudeFailure({ exitCode: 1, stderr: '{"error":{"code":"quota_exhausted"}}' }), { eligible: true, reasonCode: 'claude_quota_exhausted' });
  assert.equal(classifyClaudeFailure({ exitCode: 1, stderr: 'maybe rate limited' }).eligible, false);
  assert.deepEqual(classifyClaudeFailure({ exitCode: 1, stderr: 'authentication required' }), { eligible: false, reasonCode: 'claude_authentication' });
  assert.deepEqual(classifyClaudeFailure({ exitCode: 1, timedOut: true }), { eligible: false, reasonCode: 'claude_timeout' });
});

function harness() {
  const calls = [];
  return { calls, github: { setReviewStatus: async (...args) => calls.push(args) } };
}

test('verified quota failure invokes fallback and preserves notification/status ordering', async () => {
  const { calls, github } = harness();
  const result = await runReviewGate({ github, sha: 'abc', targetUrl: 'jira', worktree: '.', issueKey: 'JAL-1',
    pullRequestNumber: 1, issueArtifacts: '.', cycle: 1,
    claudeReview: async () => { throw new ClaudeReviewFailure({ eligible: true, reasonCode: 'claude_http_429' }); },
    codexReview: async () => ({ result: { summary: 'ok', findings: [] } }),
  });
  assert.equal(result.label, 'Codex fallback review');
  assert.deepEqual(calls.map((call) => `${call[1]}:${call[2]}`), [
    'review/claude-primary:pending', 'independent-review-gate:pending',
    'review/claude-primary:failure', 'review/codex-fallback:pending', 'review/codex-fallback:success',
  ]);
});

test('ambiguous/auth/timeout failures never invoke fallback', async () => {
  for (const reasonCode of ['claude_ambiguous_failure', 'claude_authentication', 'claude_timeout']) {
    const { github } = harness(); let invoked = false;
    await assert.rejects(runReviewGate({ github, sha: 'a', targetUrl: '', worktree: '.', issueKey: 'J', pullRequestNumber: 1,
      issueArtifacts: '.', cycle: 1, claudeReview: async () => { throw new ClaudeReviewFailure({ eligible: false, reasonCode }); },
      codexReview: async () => { invoked = true; } }));
    assert.equal(invoked, false);
  }
});

test('fallback failure and blockers fail aggregate gate; success passes it idempotently', async () => {
  const failed = harness();
  await assert.rejects(runReviewGate({ github: failed.github, sha: 'a', targetUrl: '', worktree: '.', issueKey: 'J', pullRequestNumber: 1,
    issueArtifacts: '.', cycle: 1, claudeReview: async () => { throw new ClaudeReviewFailure({ eligible: true, reasonCode: 'claude_http_429' }); },
    codexReview: async () => { throw new Error('offline'); } }));
  assert.ok(failed.calls.some((call) => call[1] === 'independent-review-gate' && call[2] === 'failure'));
  const gate = harness();
  await finalizeReviewGate({ github: gate.github, sha: 'a', targetUrl: '', provider: 'codex', blockers: [{ severity: 'P2' }] });
  await finalizeReviewGate({ github: gate.github, sha: 'a', targetUrl: '', provider: 'codex', blockers: [] });
  assert.deepEqual(gate.calls.filter((call) => call[1] === 'independent-review-gate').map((call) => call[2]), ['failure', 'success']);
  assert.ok(gate.calls.filter((call) => call[1] === 'claude-review').every((call) => call[2] === 'failure'));
});

test('evidence redaction removes common credential forms', () => {
  const safe = redactReviewEvidence('Authorization: Bearer abcdef token=secretvalue sk-abcdefghijklmnop');
  assert.doesNotMatch(safe, /abcdef|secretvalue|abcdefghijklmnop/);
});

test('redacts adversarial secrets recursively before findings can be persisted or published', () => {
  const raw = {
    summary: 'Bearer top-secret-value',
    findings: [{ title: 'token=raw-token', evidence: 'Authorization: Bearer nested-secret',
      acceptanceCriteria: 'password=hunter2', file: 'safe.mjs', fingerprint: 'sk-abcdefghijklmnop' }],
  };
  const safe = redactReviewValue(raw);
  const serialized = JSON.stringify(safe);
  assert.doesNotMatch(serialized, /top-secret-value|raw-token|nested-secret|hunter2|abcdefghijklmnop/);
  assert.match(serialized, /REDACTED/);
  assert.match(JSON.stringify(raw), /nested-secret/, 'redaction must not mutate the parsed source object');
});

test('constructs exact isolated Codex argv and rejects unsupported combinations', () => {
  const argv = buildCodexExecArguments({ workspacePath: '/review', resultPath: '/review/result.json' });
  assert.deepEqual(argv, ['exec', '--model', 'gpt-5.6-sol', '--config',
    'model_reasoning_effort="high"', '--sandbox', 'read-only', '--ephemeral',
    '--ignore-user-config', '--ignore-rules', '--output-schema',
    '/review/qa/automation/review-schema.json', '--output-last-message', '/review/result.json',
    '--cd', '/review', '-']);
  for (const override of [{ model: 'other' }, { effort: 'medium' }, { sandbox: 'workspace-write' },
    { ephemeral: false }, { ignoreUserConfig: false }, { ignoreRules: false }]) {
    assert.throws(() => buildCodexExecArguments({ workspacePath: '/r', resultPath: '/r/o', ...override }),
      /isolation policy/);
  }
});

test('checks every required Codex exec flag and fails on an unsupported CLI', async () => {
  const expected = ['--model', '--config', '--sandbox', '--ephemeral', '--ignore-user-config',
    '--ignore-rules', '--output-schema', '--output-last-message', '--cd'].join(' ');
  await verifyCodexCompatibility('codex', {}, async (_command, args) => {
    assert.deepEqual(args, ['exec', '--help']);
    return { stdout: expected, stderr: '', exitCode: 0, timedOut: false };
  });
  await assert.rejects(verifyCodexCompatibility('codex', {}, async () => ({
    stdout: '--model --sandbox', stderr: '', exitCode: 0, timedOut: false,
  })), /missing required fallback flags/);
});

test('Codex authentication accepts an exact positive and fails closed for negatives', async () => {
  const run = (stdout, exitCode = 0, timedOut = false) => async () => ({
    stdout, stderr: '', exitCode, timedOut,
  });
  await verifyCodexAuthentication('codex', {}, run('Logged in using ChatGPT'));
  for (const sample of ['Not logged in', 'logged in', 'User is logged in', '', 'Not Logged In\nLogged in']) {
    await assert.rejects(verifyCodexAuthentication('codex', {}, run(sample)), /authentication unavailable/);
  }
  await assert.rejects(verifyCodexAuthentication('codex', {}, run('Logged in', 1)), /authentication unavailable/);
  await assert.rejects(verifyCodexAuthentication('codex', {}, run('Logged in', 0, true)), /authentication unavailable/);
});
