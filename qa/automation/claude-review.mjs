import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import { runCommand } from './command.mjs';

const findingSchema = z.object({
  severity: z.enum(['P0', 'P1', 'P2', 'P3']),
  title: z.string().min(1).max(200),
  evidence: z.string().min(1).max(4000),
  file: z.string().min(1).max(500),
  line: z.number().int().positive().nullable(),
  acceptanceCriteria: z.string().min(1).max(2000),
  fingerprint: z.string().min(1).max(200),
});

const reviewSchema = z.object({
  summary: z.string().min(1).max(4000),
  findings: z.array(findingSchema).max(20),
});

const allowedEnvironmentKeys = new Set([
  'ALL_PROXY',
  'CLAUDE_CONFIG_DIR',
  'COLORTERM',
  'DISABLE_AUTO_UPDATE',
  'HOME',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'LANG',
  'LC_ALL',
  'LOGNAME',
  'NODE_EXTRA_CA_CERTS',
  'NO_PROXY',
  'PATH',
  'SHELL',
  'SSL_CERT_DIR',
  'SSL_CERT_FILE',
  'TERM',
  'TMPDIR',
  'USER',
  'XDG_CONFIG_HOME',
]);
const requiredClaudeFlags = ['--tools', '--no-session-persistence', '--permission-mode'];
const minimumClaudeVersion = [2, 1, 87];
const verifiedClaudePaths = new Map();

export function buildReviewEnvironment(source = process.env) {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([key, value]) => value !== undefined && allowedEnvironmentKeys.has(key),
    ),
  );
}

export async function verifyClaudeCompatibility(claudePath, environment) {
  if (verifiedClaudePaths.has(claudePath)) {
    return verifiedClaudePaths.get(claudePath);
  }

  const help = await runCommand(claudePath, ['--help'], {
    sensitive: true,
    inheritEnv: false,
    env: environment,
  });
  const missingFlags = requiredClaudeFlags.filter((flag) => !help.stdout.includes(flag));

  if (missingFlags.length > 0) {
    throw new Error(`Claude CLI is missing required review flags: ${missingFlags.join(', ')}`);
  }

  const versionResult = await runCommand(claudePath, ['--version'], {
    sensitive: true,
    inheritEnv: false,
    env: environment,
  });
  const installedVersion = versionResult.stdout.match(/\d+\.\d+\.\d+/)?.[0];
  if (!installedVersion || compareVersions(installedVersion, minimumClaudeVersion) < 0) {
    throw new Error(
      `Claude CLI ${minimumClaudeVersion.join('.')} or newer is required for isolated reviews.`,
    );
  }

  const capabilities = { safeMode: help.stdout.includes('--safe-mode') };
  verifiedClaudePaths.set(claudePath, capabilities);
  return capabilities;
}

function compareVersions(version, minimum) {
  const parts = version.split('.').map(Number);
  for (let index = 0; index < minimum.length; index += 1) {
    if ((parts[index] ?? 0) !== minimum[index]) {
      return (parts[index] ?? 0) - minimum[index];
    }
  }
  return 0;
}

export async function createReviewWorkspace(worktree, baseBranch = 'origin/main') {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'jalsarabose-claude-review-'));
  const reviewWorkspace = resolve(temporaryRoot, 'repository');

  try {
    const head = await runCommand('git', ['rev-parse', 'HEAD'], { cwd: worktree });
    const base = await runCommand('git', ['rev-parse', baseBranch], { cwd: worktree });
    await runCommand(
      'git',
      [
        'clone',
        '--quiet',
        '--no-hardlinks',
        '--no-checkout',
        '--no-single-branch',
        worktree,
        reviewWorkspace,
      ],
      { sensitive: true },
    );
    await runCommand('git', ['checkout', '--quiet', '--detach', head.stdout.trim()], {
      cwd: reviewWorkspace,
    });
    const diffPath = resolve(reviewWorkspace, '.claude-review.diff');
    await runCommand(
      'git',
      ['diff', '--find-renames', `--output=${diffPath}`, `${base.stdout.trim()}...HEAD`],
      { cwd: reviewWorkspace },
    );

    return {
      path: reviewWorkspace,
      dispose: () => rmSync(temporaryRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    result[argv[index]?.replace(/^--/, '')] = argv[index + 1];
  }
  return result;
}

function extractJson(value) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? trimmed.slice(trimmed.indexOf('{'), trimmed.lastIndexOf('}') + 1);
  return JSON.parse(source);
}

export async function reviewWithClaude({
  worktree,
  baseBranch = 'origin/main',
  issueKey,
  pullRequestNumber,
  outputPath,
}) {
  const claudePath = process.env.CLAUDE_CLI_PATH || 'claude';
  const reviewEnvironment = buildReviewEnvironment();
  const capabilities = await verifyClaudeCompatibility(claudePath, reviewEnvironment);
  const reviewWorkspace = await createReviewWorkspace(worktree, baseBranch);
  const prompt = [
    'You are the independent final reviewer for the Jalsarabose QA automation.',
    `Review the tracked diff against ${baseBranch} in .claude-review.diff.`,
    'Use Read, Glob, and Grep to inspect affected source files when more context is needed.',
    'Stay within the affected files, use no more than 16 tool calls, and return the review promptly.',
    `Jira ticket: ${issueKey}. Pull request: #${pullRequestNumber}.`,
    'Focus on behavioral bugs, security regressions, privacy leaks, broken React Native Web behavior, and missing tests.',
    'P0-P2 findings block merge. P3 is advisory.',
    'Return only JSON matching qa/automation/review-schema.json.',
    'Use a stable fingerprint made from severity, file, line, and normalized title.',
    'The installed Claude CLI flags were checked successfully before this invocation.',
    'Do not edit files or run any command that mutates the repository.',
  ].join('\n');
  try {
    const response = await runCommand(
      claudePath,
      [
        '-p',
        prompt,
        '--output-format',
        'json',
        '--max-turns',
        '24',
        '--permission-mode',
        'dontAsk',
        ...(capabilities.safeMode ? ['--safe-mode'] : []),
        '--no-session-persistence',
        '--tools',
        'Read,Glob,Grep',
        '--disallowedTools',
        'Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch',
      ],
      {
        cwd: reviewWorkspace.path,
        sensitive: true,
        timeoutMs: 30 * 60 * 1000,
        maxCaptureBytes: 16 * 1024 * 1024,
        inheritEnv: false,
        env: reviewEnvironment,
      },
    );

    const outer = JSON.parse(response.stdout);
    const review = reviewSchema.parse(extractJson(outer.result ?? response.stdout));
    const destination = outputPath || resolve(worktree, 'qa-artifacts/claude-review.json');
    writeFileSync(destination, `${JSON.stringify(review, null, 2)}\n`);
    return review;
  } finally {
    reviewWorkspace.dispose();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArguments(process.argv.slice(2));

  if (!args.worktree || !args.issue || !args.pr) {
    console.error(
      'Usage: node qa/automation/claude-review.mjs --worktree PATH --issue JAL-1 --pr 1 [--output FILE]',
    );
    process.exit(1);
  }

  if (!existsSync(args.worktree)) {
    console.error(`Worktree not found: ${args.worktree}`);
    process.exit(1);
  }

  const review = await reviewWithClaude({
    worktree: args.worktree,
    issueKey: args.issue,
    pullRequestNumber: Number(args.pr),
    outputPath: args.output,
  });
  process.stdout.write(`${JSON.stringify(review, null, 2)}\n`);
}
