import { runCommand } from './command.mjs';

export function getReviewCycleForHead(comments, headSha) {
  return comments.reduce((maximum, comment) => {
    const headMatch = comment.body?.match(/<!-- qa-review-head:([0-9a-f]{40}) -->/);
    const cycleMatch = headMatch?.[1] === headSha
      ? comment.body?.match(/<!-- qa-review-cycle:(\d+) -->/)
      : null;
    return Math.max(maximum, cycleMatch ? Number(cycleMatch[1]) : 0);
  }, 0);
}

export class GitHubClient {
  constructor(repository) {
    this.repository = repository;
  }

  async ensureAuthenticated() {
    await runCommand('gh', ['auth', 'status']);
  }

  async createPullRequest({ branch, title, body }) {
    await runCommand('gh', [
      'pr',
      'create',
      '--repo',
      this.repository,
      '--base',
      'main',
      '--head',
      branch,
      '--title',
      title,
      '--body',
      body,
    ]);
    return this.getPullRequest(branch);
  }

  async getPullRequest(reference) {
    const response = await runCommand('gh', [
      'pr',
      'view',
      String(reference),
      '--repo',
      this.repository,
      '--json',
      'number,url,state,mergedAt,headRefName,headRefOid',
    ]);
    return JSON.parse(response.stdout);
  }

  async setCommitStatus(sha, state, description, targetUrl = '') {
    const args = [
      'api',
      `repos/${this.repository}/statuses/${sha}`,
      '--method',
      'POST',
      '-f',
      `state=${state}`,
      '-f',
      'context=claude-review',
      '-f',
      `description=${description.slice(0, 140)}`,
    ];
    if (targetUrl) {
      args.push('-f', `target_url=${targetUrl}`);
    }
    await runCommand('gh', args);
  }

  async getCommitStatus(sha) {
    const response = await runCommand('gh', [
      'api',
      `repos/${this.repository}/commits/${sha}/statuses`,
      '--paginate',
    ]);
    return JSON.parse(response.stdout).find((status) => status.context === 'claude-review') ?? null;
  }

  async comment(pullRequestNumber, body) {
    await runCommand('gh', [
      'pr',
      'comment',
      String(pullRequestNumber),
      '--repo',
      this.repository,
      '--body',
      body,
    ]);
  }

  async enableAutoMerge(pullRequestNumber) {
    await runCommand('gh', [
      'pr',
      'merge',
      String(pullRequestNumber),
      '--repo',
      this.repository,
      '--auto',
      '--squash',
      '--delete-branch',
    ]);
  }

  async getReviewCycle(pullRequestNumber, headSha) {
    const response = await runCommand('gh', [
      'api',
      `repos/${this.repository}/issues/${pullRequestNumber}/comments`,
      '--paginate',
    ]);
    const comments = JSON.parse(response.stdout);
    return getReviewCycleForHead(comments, headSha);
  }
}
