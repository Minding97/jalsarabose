import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

import { buildReviewEnvironment, createReviewWorkspace } from './claude-review.mjs';
import { runCommand } from './command.mjs';

const MODEL = 'gpt-5.6-sol';
const EFFORT = 'high';
const reviewSchema = z.object({
  summary: z.string().min(1).max(4000),
  findings: z.array(z.object({
    severity: z.enum(['P0', 'P1', 'P2', 'P3']), title: z.string().min(1).max(200),
    evidence: z.string().min(1).max(4000), file: z.string().min(1).max(500),
    line: z.number().int().positive().nullable(), acceptanceCriteria: z.string().min(1).max(2000),
    fingerprint: z.string().min(1).max(200),
  })).max(20),
});

export function redactReviewEvidence(value) {
  return String(value)
    .replace(/authorization\s*:\s*Bearer\s+\S+/gi, 'Authorization: Bearer [REDACTED]')
    .replace(/(authorization|api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,}]+/gi, '$1=[REDACTED]')
    .replace(/\b(sk|gh[op]|xox[baprs])-[-A-Za-z0-9_]{12,}\b/g, '[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}

export async function verifyCodexAuthentication(codexPath, environment, runner = runCommand) {
  const status = await runner(codexPath, ['login', 'status'], {
    sensitive: true, inheritEnv: false, env: environment, allowFailure: true, timeoutMs: 15_000,
  });
  if (status.timedOut || status.exitCode !== 0 || !/logged in/i.test(status.stdout + status.stderr)) {
    throw new Error('Codex fallback authentication unavailable.');
  }
}

export async function reviewWithCodexFallback({
  worktree, baseBranch = 'origin/main', issueKey, pullRequestNumber, outputPath,
  reasonCode, runner = runCommand, now = () => new Date(), codexPath = process.env.CODEX_CLI_PATH || 'codex',
}) {
  if (reasonCode !== 'claude_http_429' && reasonCode !== 'claude_quota_exhausted') {
    throw new Error('Codex fallback requires a verified Claude quota reason code.');
  }
  const environment = buildReviewEnvironment();
  await verifyCodexAuthentication(codexPath, environment, runner);
  const version = await runner(codexPath, ['--version'], { sensitive: true, inheritEnv: false, env: environment });
  const workspace = await createReviewWorkspace(worktree, baseBranch);
  const resultPath = resolve(workspace.path, '.codex-fallback-result.json');
  try {
    const sha = (await runner('git', ['rev-parse', 'HEAD'], { cwd: workspace.path })).stdout.trim();
    const diff = readFileSync(resolve(workspace.path, '.claude-review.diff'));
    const diffHash = createHash('sha256').update(diff).digest('hex');
    const prompt = [
      'Perform the Codex fallback review. This is not a fully independent cross-provider review.',
      `Review only the tracked diff in .claude-review.diff against ${baseBranch}.`,
      `Jira ticket: ${issueKey}. Pull request: #${pullRequestNumber}.`,
      'Do not edit files. P0-P2 findings block merge. Return only the required JSON.',
    ].join('\n');
    const response = await runner(codexPath, [
      'exec', '--model', MODEL, '-c', `model_reasoning_effort="${EFFORT}"`, '--sandbox', 'read-only',
      '--ephemeral', '--ignore-user-config', '--ignore-rules', '--output-schema',
      resolve(workspace.path, 'qa/automation/review-schema.json'), '--output-last-message', resultPath,
      '--cd', workspace.path, '-',
    ], { input: prompt, sensitive: true, timeoutMs: 30 * 60 * 1000, maxCaptureBytes: 1024 * 1024,
      inheritEnv: false, env: environment });
    void response;
    const review = reviewSchema.parse(JSON.parse(readFileSync(resultPath, 'utf8')));
    const evidence = {
      provider: 'codex', label: 'Codex fallback review', model: MODEL,
      cliVersion: redactReviewEvidence(version.stdout.trim()), effort: EFFORT, fallbackReasonCode: reasonCode,
      commitSha: sha, diffSha256: diffHash, reviewedAt: now().toISOString(), result: review,
    };
    writeFileSync(outputPath || resolve(worktree, 'qa-artifacts/codex-fallback-review.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    return evidence;
  } finally {
    workspace.dispose();
  }
}

export const codexFallbackConstants = { model: MODEL, effort: EFFORT };
