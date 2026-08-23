import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  previewEligibility,
  refreshLanPreview,
  resolveRunVerifiedMainSha,
} from './preview-refresh.mjs';

const expectedSha = 'a'.repeat(40);
const previousSha = 'b'.repeat(40);
const unrelatedSha = 'c'.repeat(40);
const success = {
  status: '성공',
  ticketResults: [{ key: 'JAL-1', result: '성공' }],
  pullRequests: ['#1 merged'],
  verifiedPullRequests: [{ number: 1, mergeSha: expectedSha }],
  remainingQueue: [],
};

function commandName(command, args) {
  return `${command} ${args.join(' ')}`;
}

function successfulGitResult(args, remoteSha = expectedSha) {
  if (args[0] === 'status') return { stdout: '' };
  if (args[0] === 'rev-parse' && args[1] === 'HEAD') return { stdout: `${previousSha}\n` };
  if (args[0] === 'rev-parse' && args[1] === 'origin/main') return { stdout: `${remoteSha}\n` };
  return { stdout: '' };
}

test('refreshes only after every processed ticket and PR completed', () => {
  assert.deepEqual(previewEligibility(success), { eligible: true });
  assert.equal(previewEligibility({ ...success, pullRequests: ['#1 대기'] }).eligible, false);
  assert.equal(previewEligibility({ ...success, verifiedPullRequests: [] }).eligible, false);
  assert.equal(previewEligibility({ ...success, ticketResults: [{ key: 'JAL-1', result: '보류' }] }).eligible, false);
  assert.equal(previewEligibility({ ...success, remainingQueue: ['JAL-2'] }).eligible, false);
});

test('never refreshes for dry runs, failed execution, or no PR confirmed by this run', () => {
  assert.equal(previewEligibility(success, { dryRun: true }).eligible, false);
  assert.equal(previewEligibility(success, { runFailed: true }).eligible, false);
  assert.deepEqual(
    previewEligibility({ ...success, pullRequests: [], verifiedPullRequests: [] }),
    { eligible: false, reason: '이번 실행에서 확인한 병합 PR 없음' },
  );
});

test('resolves the exact last merge commit confirmed by this nightly run', () => {
  assert.equal(resolveRunVerifiedMainSha({
    verifiedPullRequests: [
      { number: 1, mergeSha: previousSha },
      { number: 2, mergeSha: expectedSha },
    ],
  }), expectedSha);
  assert.throws(
    () => resolveRunVerifiedMainSha({ verifiedPullRequests: [{ number: 2 }] }),
    /PR 병합 커밋 SHA가 필요합니다/,
  );
});

test('refreshLanPreview switches, installs, restarts, and health-checks successfully', async () => {
  const previewRoot = mkdtempSync(resolve(tmpdir(), 'preview-refresh-success-'));
  const calls = [];
  const fetchedUrls = [];
  const run = async (command, args, options) => {
    calls.push({ command, args, options });
    return command === 'git' ? successfulGitResult(args) : { stdout: '' };
  };
  const fetchImpl = async (url) => {
    fetchedUrls.push(url);
    return { ok: true };
  };

  try {
    assert.deepEqual(await refreshLanPreview({ expectedSha, previewRoot, run, fetchImpl }), {
      status: '반영',
      sha: expectedSha,
      sync: '성공',
      restart: '성공',
      health: '성공',
    });
    assert.deepEqual(calls.map(({ command, args }) => commandName(command, args)), [
      'git status --porcelain',
      'git rev-parse HEAD',
      'git fetch origin main',
      'git rev-parse origin/main',
      `git switch --detach ${expectedSha}`,
      'npm ci --ignore-scripts',
      `launchctl kickstart -k gui/${process.getuid()}/com.jalsarabose.lan-preview`,
    ]);
    assert.deepEqual(fetchedUrls, [
      'http://127.0.0.1:18787/health',
      'http://127.0.0.1:19006/',
    ]);
  } finally {
    rmSync(previewRoot, { recursive: true, force: true });
  }
});

test('refreshLanPreview rolls back to previousSha when a forward step fails', async () => {
  const previewRoot = mkdtempSync(resolve(tmpdir(), 'preview-refresh-rollback-'));
  const calls = [];
  let npmCalls = 0;
  const run = async (command, args) => {
    calls.push(commandName(command, args));
    if (command === 'git') return successfulGitResult(args);
    if (command === 'npm' && ++npmCalls === 1) throw new Error('forward npm failed');
    return { stdout: '' };
  };

  try {
    await assert.rejects(
      refreshLanPreview({
        expectedSha,
        previewRoot,
        run,
        fetchImpl: async () => ({ ok: true }),
      }),
      /forward npm failed; 이전 preview 롤백 성공/,
    );
    assert.deepEqual(calls.filter((call) => call.startsWith('git switch')), [
      `git switch --detach ${expectedSha}`,
      `git switch --detach ${previousSha}`,
    ]);
    assert.equal(calls.filter((call) => call === 'npm ci --ignore-scripts').length, 2);
    assert.equal(calls.filter((call) => call.startsWith('launchctl kickstart')).length, 1);
  } finally {
    rmSync(previewRoot, { recursive: true, force: true });
  }
});

test('refreshLanPreview reports rollback command and health failures', async () => {
  const previewRoot = mkdtempSync(resolve(tmpdir(), 'preview-refresh-rollback-failure-'));
  const run = async (command, args) => {
    if (command === 'git') {
      if (args[0] === 'switch' && args.at(-1) === previousSha) throw new Error('rollback switch failed');
      return successfulGitResult(args);
    }
    if (command === 'npm') throw new Error('npm failed');
    if (command === 'launchctl') throw new Error('restart failed');
    return { stdout: '' };
  };

  try {
    await assert.rejects(
      refreshLanPreview({
        expectedSha,
        previewRoot,
        run,
        fetchImpl: async () => ({ ok: false }),
        healthCheckOptions: { attempts: 1, delayMs: 0 },
      }),
      (error) => {
        assert.match(error.message, /npm failed; 이전 preview 롤백 실패/);
        assert.match(error.message, /git switch: rollback switch failed/);
        assert.match(error.message, /npm ci: npm failed/);
        assert.match(error.message, /restart: restart failed/);
        assert.match(error.message, /health check 실패/);
        return true;
      },
    );
  } finally {
    rmSync(previewRoot, { recursive: true, force: true });
  }
});

test('refreshLanPreview fails closed when unrelated main movement follows the confirmed merge', async () => {
  const previewRoot = mkdtempSync(resolve(tmpdir(), 'preview-refresh-main-moved-'));
  const calls = [];
  const run = async (command, args) => {
    calls.push(commandName(command, args));
    return command === 'git' ? successfulGitResult(args, unrelatedSha) : { stdout: '' };
  };

  try {
    await assert.rejects(
      refreshLanPreview({ expectedSha, previewRoot, run }),
      /이번 실행이 확인한 병합 SHA와 현재 origin\/main이 달라/,
    );
    assert.equal(calls.some((call) => call.startsWith('git switch')), false);
    assert.equal(calls.some((call) => call.startsWith('npm ')), false);
    assert.equal(calls.some((call) => call.startsWith('launchctl ')), false);
  } finally {
    rmSync(previewRoot, { recursive: true, force: true });
  }
});
