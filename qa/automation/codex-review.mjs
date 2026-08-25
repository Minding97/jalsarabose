import { copyFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { runCodexCommand } from './codex-command.mjs';
import { createReviewWorkspace, reviewSchema } from './claude-review.mjs';

export async function reviewWithCodex({ worktree, baseBranch = 'origin/main', issueKey, pullRequestNumber, outputPath }) {
  const destination = outputPath || resolve(worktree, 'qa-artifacts/codex-review.json');
  const reviewWorkspace = await createReviewWorkspace(worktree, baseBranch);
  const temporaryResult = resolve(reviewWorkspace.path, '.codex-review.json');
  const prompt = [
    'Act as an independent, read-only final code reviewer.',
    `Review the complete tracked diff from ${baseBranch} to HEAD for Jira ${issueKey}, PR #${pullRequestNumber}.`,
    'Inspect relevant surrounding code and tests. Do not edit files, commit, push, or change repository state.',
    'Report only actionable behavioral, security, privacy, reliability, or test-coverage defects.',
    'P0-P2 findings block merge; P3 is advisory. Include exact file, line, reproduction evidence, acceptance criteria, and a stable fingerprint.',
    'Return JSON matching qa/automation/review-schema.json. Return an empty findings array when no defects are found.',
  ].join('\n');
  try {
    await runCodexCommand({
      codexPath: process.env.CODEX_CLI_PATH || '/Applications/ChatGPT.app/Contents/Resources/codex',
      worktree: reviewWorkspace.path,
      schemaPath: resolve(reviewWorkspace.path, 'qa/automation/review-schema.json'),
      resultPath: temporaryResult,
      prompt,
    });
    const review = reviewSchema.parse(JSON.parse(readFileSync(temporaryResult, 'utf8')));
    copyFileSync(temporaryResult, destination);
    return review;
  } finally {
    reviewWorkspace.dispose();
  }
}
