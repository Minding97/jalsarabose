import assert from 'node:assert/strict';
import test from 'node:test';

import { JiraClient } from './jira-client.mjs';

const config = {
  jiraBaseUrl: 'https://example.atlassian.net',
  jiraEmail: 'qa@example.com',
  jiraApiToken: 'test-token',
  jiraProjectKey: 'JAL',
};

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
  });

  assert.equal(requestBodies[0].fields.issuetype.name, '버그');
});
