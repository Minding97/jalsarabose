import { resolve } from 'node:path';

import { ClaudeReviewFailure, reviewWithClaude } from './claude-review.mjs';
import { reviewWithCodexFallback } from './codex-fallback-review.mjs';

export async function runReviewGate({ github, sha, targetUrl, worktree, issueKey,
  pullRequestNumber, issueArtifacts, cycle, claudeReview = reviewWithClaude,
  codexReview = reviewWithCodexFallback }) {
  await github.setReviewStatus(sha, 'review/claude-primary', 'pending', `Claude primary review ${cycle} running`, targetUrl);
  await github.setReviewStatus(sha, 'independent-review-gate', 'pending', 'Primary review running', targetUrl);
  try {
    const review = await claudeReview({ worktree, issueKey, pullRequestNumber,
      outputPath: resolve(issueArtifacts, `claude-review-${cycle}.json`) });
    await github.setReviewStatus(sha, 'review/claude-primary', 'success', 'Claude primary review completed', targetUrl);
    await github.setReviewStatus(sha, 'review/codex-fallback', 'success', 'Not used: Claude primary completed', targetUrl);
    const outcome = { provider: 'claude', label: 'Claude primary review', review };
    github.lastReviewOutcome = outcome;
    return outcome;
  } catch (error) {
    const classification = error instanceof ClaudeReviewFailure ? error.classification : null;
    await github.setReviewStatus(sha, 'review/claude-primary', 'failure',
      classification?.reasonCode || 'Claude primary review failed', targetUrl);
    if (!classification?.eligible) {
      await github.setReviewStatus(sha, 'review/codex-fallback', 'failure', 'Not eligible for fallback', targetUrl);
      await github.setReviewStatus(sha, 'independent-review-gate', 'failure', 'Review unavailable; fallback not authorized', targetUrl);
      throw error;
    }
    await github.setReviewStatus(sha, 'review/codex-fallback', 'pending', `Codex fallback: ${classification.reasonCode}`, targetUrl);
    try {
      const evidence = await codexReview({ worktree, issueKey, pullRequestNumber,
        outputPath: resolve(issueArtifacts, `codex-fallback-review-${cycle}.json`),
        reasonCode: classification.reasonCode });
      await github.setReviewStatus(sha, 'review/codex-fallback', 'success', 'Codex fallback review completed', targetUrl);
      const outcome = { provider: 'codex', label: 'Codex fallback review', review: evidence.result, evidence };
      github.lastReviewOutcome = outcome;
      return outcome;
    } catch (fallbackError) {
      await github.setReviewStatus(sha, 'review/codex-fallback', 'failure', 'Codex fallback review failed', targetUrl);
      await github.setReviewStatus(sha, 'independent-review-gate', 'failure', 'Fallback failed; merge blocked', targetUrl);
      throw fallbackError;
    }
  }
}

export async function finalizeReviewGate({ github, sha, targetUrl, provider, blockers }) {
  const state = blockers.length ? 'failure' : 'success';
  const description = blockers.length
    ? `${blockers.length} blocking ${provider} review finding(s)`
    : `${provider} review passed`;
  await github.setReviewStatus(sha, 'independent-review-gate', state, description, targetUrl);
  // Keep the legacy required context truthful during the owner-approved migration window.
  await github.setReviewStatus(sha, 'claude-review', provider === 'claude' ? state : 'failure',
    provider === 'claude' ? description : 'Claude unavailable; Codex fallback is not this check', targetUrl);
}
