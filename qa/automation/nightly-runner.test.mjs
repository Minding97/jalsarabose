import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyNightlyStatus, processIssue } from './nightly-runner.mjs';

const config = {
  jiraDoneStatus: '완료',
  jiraNeedsHumanStatus: '사람 확인 필요',
};

function jiraWith(issue, parent = issue) {
  const transitions = [];
  return {
    transitions,
    getIssue: async (key) => key === issue.fields.parent?.key ? parent : issue,
    transitionIssue: async (key, status) => transitions.push([key, status]),
  };
}

test('processIssue verifies an existing merged PR and Jira Done before success', async () => {
  const issue = {
    key: 'JAL-47',
    fields: { summary: 'blocker', labels: ['pr-16'], status: { name: '해야 할 일' } },
  };
  const jira = jiraWith(issue);
  jira.getIssue = async () => ({ ...issue, fields: { ...issue.fields, status: { name: '완료' } } });
  const github = { getPullRequest: async () => ({ number: 16, state: 'MERGED', mergedAt: '2026-08-12' }) };
  assert.equal(await processIssue({ jira, github, config, issue, dryRun: false }), true);
  assert.deepEqual(jira.transitions, [['JAL-47', '완료']]);
});

test('processIssue does not claim success when a parent needs human review', async () => {
  const issue = {
    key: 'JAL-48',
    fields: { parent: { key: 'JAL-47' }, summary: 'child', labels: [], status: { name: '해야 할 일' } },
  };
  const parent = { key: 'JAL-47', fields: { status: { name: '사람 확인 필요' } } };
  const jira = jiraWith(issue, parent);
  assert.equal(await processIssue({ jira, github: {}, config, issue, dryRun: false }), false);
  assert.deepEqual(jira.transitions, [['JAL-48', '사람 확인 필요']]);
});

test('processIssue requires a merged PR when a completed parent closes its subtask', async () => {
  const issue = {
    key: 'JAL-48',
    fields: {
      parent: { key: 'JAL-47' }, summary: 'child', labels: ['pr-16'], status: { name: '해야 할 일' },
    },
  };
  const parent = { key: 'JAL-47', fields: { status: { name: '완료' } } };
  const jira = jiraWith(issue, parent);
  jira.getIssue = async (key) => key === 'JAL-47'
    ? parent
    : { ...issue, fields: { ...issue.fields, status: { name: '완료' } } };
  const github = { getPullRequest: async () => ({ number: 16, state: 'OPEN' }) };
  assert.equal(await processIssue({ jira, github, config, issue, dryRun: false }), false);
});

test('processIssue uses a completed parent merged PR for a subtask without its own PR label', async () => {
  const issue = { key: 'JAL-48', fields: { parent: { key: 'JAL-47' }, summary: 'child', labels: [], status: { name: '해야 할 일' } } };
  const parent = { key: 'JAL-47', fields: { labels: ['pr-16'], status: { name: '완료' } } };
  const jira = jiraWith(issue, parent);
  jira.getIssue = async (key) => key === 'JAL-47' ? parent : { ...issue, fields: { ...issue.fields, status: { name: '완료' } } };
  const github = { getPullRequest: async () => ({ number: 16, state: 'MERGED' }) };
  assert.equal(await processIssue({ jira, github, config, issue, dryRun: false }), true);
});

test('processIssue contains PR lookup failures to the affected ticket', async () => {
  const issue = { key: 'JAL-47', fields: { summary: 'blocker', labels: ['pr-16'], status: { name: '해야 할 일' } } };
  const github = { getPullRequest: async () => { throw new Error('offline'); } };
  assert.equal(await processIssue({ jira: jiraWith(issue), github, config, issue, dryRun: false }), false);
});

test('processIssue dry-run is conservative for unprocessed work', async () => {
  const issue = {
    key: 'JAL-47',
    fields: { summary: 'blocker', labels: [], status: { name: '해야 할 일' } },
  };
  assert.equal(await processIssue({
    jira: jiraWith(issue), github: {}, config, issue, dryRun: true,
  }), false);
});

test('nightly completion status does not call an all-held queue successful', () => {
  assert.equal(classifyNightlyStatus([{ key: 'JAL-48', result: '보류' }]), '보류/지연');
  assert.equal(classifyNightlyStatus([], 2), '보류/지연');
  assert.equal(classifyNightlyStatus([{ key: 'JAL-47', result: '성공' }, { key: 'JAL-48', result: '보류' }], 2), '보류/지연');
  assert.equal(classifyNightlyStatus([{ key: 'JAL-47', result: '성공' }], 2), '보류/지연');
  assert.equal(classifyNightlyStatus([{ key: 'JAL-47', result: '성공' }]), '성공');
  assert.equal(classifyNightlyStatus([{ key: 'JAL-47', result: '실패/미병합' }]), '일부 실패');
});
