import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  const prompt = [
    'You are the independent final reviewer for the Jalsarabose QA automation.',
    `Review the current worktree diff against ${baseBranch}.`,
    `Jira ticket: ${issueKey}. Pull request: #${pullRequestNumber}.`,
    'Focus on behavioral bugs, security regressions, privacy leaks, broken React Native Web behavior, and missing tests.',
    'P0-P2 findings block merge. P3 is advisory.',
    'Return only JSON matching qa/automation/review-schema.json.',
    'Use a stable fingerprint made from severity, file, line, and normalized title.',
    'Do not edit files or run any command that mutates the repository.',
  ].join('\n');
  const response = await runCommand(
    claudePath,
    [
      '-p',
      prompt,
      '--output-format',
      'json',
      '--max-turns',
      '8',
      '--permission-mode',
      'plan',
      '--allowedTools',
      'Read,Glob,Grep,Bash(git diff:*),Bash(git show:*),Bash(git status:*),Bash(rg:*),Bash(npm run qa:test:*),Bash(npm run typecheck:*),Bash(npm run lint:*)',
      '--disallowedTools',
      'Edit,Write,NotebookEdit,WebFetch,WebSearch',
    ],
    { cwd: worktree, sensitive: true, timeoutMs: 30 * 60 * 1000 },
  );

  const outer = JSON.parse(response.stdout);
  const review = reviewSchema.parse(extractJson(outer.result ?? response.stdout));
  const destination = outputPath || resolve(worktree, 'qa-artifacts/claude-review.json');
  writeFileSync(destination, `${JSON.stringify(review, null, 2)}\n`);
  return review;
}

if (import.meta.url === `file://${process.argv[1]}`) {
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
