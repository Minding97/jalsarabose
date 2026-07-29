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
