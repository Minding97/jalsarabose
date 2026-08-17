import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAutomationBugLabel,
  getReviewLabels,
  issueMatchesReviewFindings,
  JiraClient,
} from './jira-client.mjs';

const config = {
  jiraBaseUrl: 'https://example.atlassian.net',
  jiraEmail: 'qa@example.com',
  jiraApiToken: 'test-token',
  jiraProjectKey: 'JAL',
};

test('requires the automation-ready label in the nightly queue JQL', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return Response.json({ issues: [] });
  };

  const client = new JiraClient({ ...config, jiraReadyStatus: '해야 할 일' });
  await client.searchReadyIssues();

  assert.match(requestBody.jql, /status = "해야 할 일"/);
  assert.match(requestBody.jql, /labels = "auto-fix-ready"/);
});

test('paginates status searches beyond 100 Jira issues', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const requestBodies = [];

  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    requestBodies.push(body);
    const payload = body.nextPageToken
      ? { issues: [{ key: 'JAL-101' }] }
      : { issues: [{ key: 'JAL-1' }], nextPageToken: 'page-2' };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const client = new JiraClient(config);
  const issues = await client.searchIssuesByStatus('완료');

  assert.deepEqual(
    issues.map((issue) => issue.key),
    ['JAL-1', 'JAL-101'],
  );
  assert.equal(requestBodies[1].nextPageToken, 'page-2');
});

test('uses configured Jira issue type names when creating a report', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const requestBodies = [];

  globalThis.fetch = async (url, init = {}) => {
    if (init.body) {
      requestBodies.push(JSON.parse(init.body));
    }
    if (String(url).endsWith('/rest/api/3/issue') && init.method === 'POST') {
      return Response.json({ key: 'JAL-1' });
    }
    if (String(url).endsWith('/transitions') && !init.method) {
      return Response.json({ transitions: [] });
    }
    return Response.json({ fields: { status: { name: '자동수정 대기' } } });
  };

  const client = new JiraClient({
    ...config,
    jiraBugType: '버그',
    jiraTaskType: '작업',
    jiraReadyStatus: '자동수정 대기',
  });
  await client.createReport({
    kind: 'bug',
    memo: '버튼이 동작하지 않음',
    reporter: 'QA',
    path: '/',
    createdAt: '2026-08-03T00:00:00.000Z',
    userAgent: 'test',
    viewport: { width: 390, height: 844, devicePixelRatio: 3 },
    commitSha: 'test',
    recordingIncluded: false,
    recordingStepCount: 0,
    recordingDurationMs: 0,
    reportId: 'REPORT-1',
    details: '자동 테스트 오류 상세',
    labels: ['daily-regression', getAutomationBugLabel('failure-one')],
  });

  assert.equal(requestBodies[0].fields.issuetype.name, '버그');
  assert.ok(requestBodies[0].fields.labels.includes('daily-regression'));
  assert.match(
    JSON.stringify(requestBodies[0].fields.description),
    /자동 테스트 오류 상세/,
  );
});

test('finds an unresolved daily automation bug by its stable fingerprint', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  let requestBody;

  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return Response.json({ issues: [{ key: 'JAL-70' }] });
  };

  const client = new JiraClient({ ...config, jiraDoneStatus: '완료' });
  const issue = await client.findOpenAutomationBug('same-failure');

  assert.equal(issue.key, 'JAL-70');
  assert.match(requestBody.jql, new RegExp(getAutomationBugLabel('same-failure')));
  assert.match(requestBody.jql, /status != "완료"/);
});

test('matches review subtasks by the full fingerprint when legacy labels collide', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const targetFingerprint = 'p1-qa-automation-"quoted"-review\\second-finding';

  globalThis.fetch = async () =>
    Response.json({
      issues: [
        {
          key: 'JAL-30',
          fields: {
            description: {
              content: [{ content: [{ text: 'Fingerprint: p1-qa-automation-claude-review-first' }] }],
            },
          },
        },
        {
          key: 'JAL-33',
          fields: {
            description: {
              content: [{ content: [{ text: `Fingerprint: ${targetFingerprint}` }] }],
            },
          },
        },
      ],
    });

  const client = new JiraClient(config);
  const issue = await client.findReviewSubtask('JAL-26', targetFingerprint);

  assert.equal(issue.key, 'JAL-33');
});

test('keeps a subtask open when its hashed review finding is still blocking', () => {
  const fingerprint = 'p1-current-blocker';
  const issue = {
    fields: { labels: ['qa-review-followup', getReviewLabels(fingerprint)[0]] },
  };

  assert.equal(issueMatchesReviewFindings(issue, [{ fingerprint }]), true);
  assert.equal(issueMatchesReviewFindings(issue, [{ fingerprint: 'p1-resolved' }]), false);
});
