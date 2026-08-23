import { runCommand } from './command.mjs';

export class GitHubClient {
  constructor(repository, commandRunner = runCommand) {
    this.repository = repository;
    this.runCommand = commandRunner;
  }

  async ensureAuthenticated() {
    await this.runCommand('gh', ['auth', 'status']);
  }

  async createPullRequest({ branch, title, body }) {
    await this.runCommand('gh', [
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
    const response = await this.runCommand('gh', [
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

  async getCompletionGate(reference) {
    const response = await this.runCommand('gh', [
      'pr', 'view', String(reference), '--repo', this.repository, '--json',
      'number,state,mergedAt,headRefOid,statusCheckRollup',
    ]);
    const pullRequest = JSON.parse(response.stdout);
    const checks = pullRequest.statusCheckRollup ?? [];
    const verify = checks.find((check) => (check.name ?? check.context) === 'verify');
    const claude = checks.find((check) => (check.name ?? check.context) === 'claude-review');
    const succeeded = (check) =>
      check?.conclusion === 'SUCCESS' || check?.state === 'SUCCESS';
    return {
      pullRequest,
      merged: pullRequest.state === 'MERGED' || Boolean(pullRequest.mergedAt),
      verifySuccess: succeeded(verify),
      claudeSuccess: succeeded(claude),
      complete:
        (pullRequest.state === 'MERGED' || Boolean(pullRequest.mergedAt)) &&
        succeeded(verify) && succeeded(claude),
    };
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
    await this.runCommand('gh', args);
  }

  async comment(pullRequestNumber, body) {
    await this.runCommand('gh', [
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
    await this.runCommand('gh', [
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

  async getReviewCycle(pullRequestNumber) {
    const response = await this.runCommand('gh', [
      'api',
      `repos/${this.repository}/issues/${pullRequestNumber}/comments`,
      '--paginate',
    ]);
    const comments = JSON.parse(response.stdout);
    return comments.reduce((maximum, comment) => {
      const match = comment.body?.match(/<!-- qa-review-cycle:(\d+) -->/);
      return Math.max(maximum, match ? Number(match[1]) : 0);
    }, 0);
  }
}
