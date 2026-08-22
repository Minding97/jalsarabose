import { createHash } from 'node:crypto';

function adfParagraph(text) {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text: String(text) }],
  };
}

function adfText(node) {
  if (!node) {
    return '';
  }
  if (Array.isArray(node)) {
    return node.map(adfText).join('');
  }
  if (typeof node.text === 'string') {
    return node.text;
  }
  return adfText(node.content);
}

function reviewLabel(fingerprint) {
  return `review-${createHash('sha256').update(fingerprint).digest('hex').slice(0, 32)}`;
}

export function getAutomationBugLabel(fingerprint) {
  return `daily-qa-${createHash('sha256').update(fingerprint).digest('hex').slice(0, 32)}`;
}

export function getReviewLabels(fingerprint) {
  return [reviewLabel(fingerprint), legacyReviewLabel(fingerprint)];
}

export function issueMatchesReviewFindings(issue, findings) {
  const labels = issue.fields?.labels ?? [];
  return findings.some((finding) =>
    getReviewLabels(finding.fingerprint).some((label) => labels.includes(label)),
  );
}

function legacyReviewLabel(fingerprint) {
  return `review-${fingerprint
    .slice(0, 32)
    .replace(/[^a-z0-9-]/gi, '-')
    .toLowerCase()}`;
}

function buildDescription(metadata) {
  const lines = [
    `제보자: ${metadata.reporter}`,
    `유형: ${metadata.kind === 'bug' ? '버그' : 'Task'}`,
    `메모: ${metadata.memo}`,
    `경로: ${metadata.path}`,
    `접수 시각: ${metadata.createdAt}`,
    `브라우저: ${metadata.userAgent}`,
    `화면: ${metadata.viewport.width}x${metadata.viewport.height} @${metadata.viewport.devicePixelRatio}`,
    `Commit: ${metadata.commitSha}`,
    `Recording: ${metadata.recordingIncluded ? `${metadata.recordingStepCount}단계 / ${metadata.recordingDurationMs}ms` : '없음'}`,
    `Report ID: ${metadata.reportId}`,
  ];

  if (metadata.details) {
    lines.push(`상세: ${metadata.details}`);
  }

  return {
    type: 'doc',
    version: 1,
    content: lines.map(adfParagraph),
  };
}

export class JiraClient {
  constructor(config) {
    this.config = config;
    this.authorization = `Basic ${Buffer.from(
      `${config.jiraEmail}:${config.jiraApiToken}`,
    ).toString('base64')}`;
  }

  async request(path, init = {}) {
    const response = await fetch(`${this.config.jiraBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: this.authorization,
        ...init.headers,
      },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Jira ${response.status}: ${message.slice(0, 1000)}`);
    }

    if (response.status === 204) {
      return null;
    }

    const contentType = response.headers.get('content-type') ?? '';
    return contentType.includes('application/json') ? response.json() : response.arrayBuffer();
  }

  async createReport(metadata) {
    const issueType =
      metadata.kind === 'bug'
        ? (this.config.jiraBugType ?? 'Bug')
        : (this.config.jiraTaskType ?? 'Task');
    const summary = `[${metadata.kind === 'bug' ? 'Bug' : 'Task'}] ${metadata.memo}`
      .replace(/\s+/g, ' ')
      .slice(0, 120);
    const issue = await this.request('/rest/api/3/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          project: { key: this.config.jiraProjectKey },
          issuetype: { name: issueType },
          summary,
          description: buildDescription(metadata),
          labels: [
            ...new Set([
              'qa-report',
              'auto-fix-ready',
              `qa-report-${metadata.reportId.toLowerCase()}`,
              ...(metadata.labels ?? []),
            ]),
          ],
        },
      }),
    });

    await this.transitionIssue(issue.key, this.config.jiraReadyStatus);
    return issue;
  }

  async findReport(reportId) {
    const label = `qa-report-${reportId.toLowerCase()}`;
    const response = await this.request('/rest/api/3/search/jql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jql: `project = "${this.config.jiraProjectKey}" AND labels = "${label}"`,
        maxResults: 1,
        fields: ['key', 'summary', 'status'],
      }),
    });
    return response.issues?.[0] ?? null;
  }

  async findOpenAutomationBug(fingerprint) {
    const label = getAutomationBugLabel(fingerprint);
    const response = await this.request('/rest/api/3/search/jql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jql: `project = "${this.config.jiraProjectKey}" AND labels = "${label}" AND status != "${this.config.jiraDoneStatus}" ORDER BY created DESC`,
        maxResults: 1,
        fields: ['key', 'summary', 'status'],
      }),
    });
    return response.issues?.[0] ?? null;
  }

  async attach(issueKey, filename, data, contentType = 'application/octet-stream') {
    const form = new FormData();
    form.append('file', new Blob([data], { type: contentType }), filename);
    return this.request(`/rest/api/3/issue/${issueKey}/attachments`, {
      method: 'POST',
      headers: {
        'X-Atlassian-Token': 'no-check',
      },
      body: form,
    });
  }

  async transitionIssue(issueKey, targetStatus) {
    const response = await this.request(`/rest/api/3/issue/${issueKey}/transitions`);
    const transition = response.transitions?.find(
      (candidate) =>
        candidate.name === targetStatus || candidate.to?.name === targetStatus,
    );

    if (!transition) {
      const issue = await this.getIssue(issueKey);
      if (issue.fields?.status?.name === targetStatus) {
        return;
      }
      throw new Error(`Jira transition not found: ${targetStatus}`);
    }

    await this.request(`/rest/api/3/issue/${issueKey}/transitions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transition: { id: transition.id } }),
    });
  }

  async searchReadyIssues() {
    const issues = [];
    let nextPageToken;
    const readyStatus = this.config.jiraReadyStatus ?? '자동수정 대기';
    const reviewStatuses = [...new Set([this.config.jiraReviewStatus ?? '검토 중', '검토 중', '리뷰 중'])];
    const candidateStatuses = [...new Set([readyStatus, ...reviewStatuses])];
    const statusJql = candidateStatuses
      .map((status) => `"${status.replaceAll('"', '\\"')}"`)
      .join(', ');

    do {
      const response = await this.request('/rest/api/3/search/jql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jql: `project = "${this.config.jiraProjectKey}" AND status in (${statusJql}) AND labels = "auto-fix-ready" ORDER BY priority DESC, created ASC`,
          maxResults: 100,
          nextPageToken,
          fields: [
            'summary',
            'description',
            'status',
            'created',
            'labels',
            'parent',
            'attachment',
            'issuetype',
            'priority',
            'issuelinks',
          ],
        }),
      });
      issues.push(...(response.issues ?? []));
      nextPageToken = response.nextPageToken;
    } while (nextPageToken);

    return issues.filter((issue) => {
      const status = issue.fields?.status?.name;
      if (status === readyStatus) return true;
      return reviewStatuses.includes(status)
        && (issue.fields?.labels ?? []).some((label) => /^pr-\d+$/.test(label));
    });
  }

  async getIssue(issueKey) {
    return this.request(
      `/rest/api/3/issue/${issueKey}?fields=summary,description,status,created,labels,parent,attachment,comment`,
    );
  }

  async searchIssuesByStatus(statusName, extraJql = '') {
    const issues = [];
    let nextPageToken;

    do {
      const response = await this.request('/rest/api/3/search/jql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jql: `project = "${this.config.jiraProjectKey}" AND status = "${statusName}" ${extraJql}`.trim(),
          maxResults: 100,
          nextPageToken,
          fields: [
            'summary',
            'status',
            'created',
            'updated',
            'labels',
            'parent',
            'attachment',
          ],
        }),
      });
      issues.push(...(response.issues ?? []));
      nextPageToken = response.nextPageToken;
    } while (nextPageToken);

    return issues;
  }

  async addLabel(issueKey, label) {
    await this.request(`/rest/api/3/issue/${issueKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        update: {
          labels: [{ add: label }],
        },
      }),
    });
  }

  async createReviewSubtask(parentKey, finding, pullRequestNumber) {
    const issue = await this.request('/rest/api/3/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          project: { key: this.config.jiraProjectKey },
          parent: { key: parentKey },
          issuetype: { name: this.config.jiraSubtaskType },
          summary: `[${finding.severity}] ${finding.title}`.slice(0, 120),
          description: {
            type: 'doc',
            version: 1,
            content: [
              adfParagraph(`근거: ${finding.evidence}`),
              adfParagraph(`위치: ${finding.file}:${finding.line ?? '-'}`),
              adfParagraph(`완료 조건: ${finding.acceptanceCriteria}`),
              adfParagraph(`PR: #${pullRequestNumber}`),
              adfParagraph(`Fingerprint: ${finding.fingerprint}`),
            ],
          },
          labels: [
            'qa-review-followup',
            'auto-fix-ready',
            `pr-${pullRequestNumber}`,
            getReviewLabels(finding.fingerprint)[0],
          ],
        },
      }),
    });
    await this.transitionIssue(issue.key, this.config.jiraReadyStatus);
    return issue;
  }

  async findReviewSubtask(parentKey, fingerprint) {
    const [label, legacyLabel] = getReviewLabels(fingerprint);
    const response = await this.request('/rest/api/3/search/jql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jql: `project = "${this.config.jiraProjectKey}" AND parent = "${parentKey}" AND labels in ("${label}", "${legacyLabel}")`,
        maxResults: 20,
        fields: ['summary', 'status', 'description'],
      }),
    });
    const marker = `Fingerprint: ${fingerprint}`;
    return (
      response.issues?.find((issue) => adfText(issue.fields?.description).includes(marker)) ??
      null
    );
  }

  async addComment(issueKey, text) {
    return this.request(`/rest/api/3/issue/${issueKey}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: {
          type: 'doc',
          version: 1,
          content: [adfParagraph(text)],
        },
      }),
    });
  }

  async downloadAttachment(attachment) {
    const payload = await this.request(
      `/rest/api/3/attachment/content/${attachment.id}?redirect=false`,
    );
    return Buffer.from(payload);
  }

  async deleteAttachment(attachmentId) {
    await this.request(`/rest/api/3/attachment/${attachmentId}`, { method: 'DELETE' });
  }
}
