import assert from 'node:assert/strict';
import test from 'node:test';

import { getClaudeReviewStatus, getReviewCycleForHead } from './github.mjs';

test('review cycles are scoped to the exact PR head SHA', () => {
  const oldHead = 'a'.repeat(40);
  const newHead = 'b'.repeat(40);
  const comments = [
    { body: '<!-- qa-review-cycle:3 -->' },
    { body: `<!-- qa-review-head:${oldHead} -->\n<!-- qa-review-cycle:3 -->` },
    { body: `<!-- qa-review-head:${newHead} -->\n<!-- qa-review-cycle:1 -->` },
  ];
  assert.equal(getReviewCycleForHead(comments, oldHead), 3);
  assert.equal(getReviewCycleForHead(comments, newHead), 1);
  assert.equal(getReviewCycleForHead(comments, 'c'.repeat(40)), 0);
});

test('selects only the Claude review commit status', () => {
  const claudeStatus = { context: 'claude-review', state: 'success' };
  assert.equal(getClaudeReviewStatus([{ context: 'verify' }, claudeStatus]), claudeStatus);
  assert.equal(getClaudeReviewStatus([{ context: 'verify' }]), null);
});
