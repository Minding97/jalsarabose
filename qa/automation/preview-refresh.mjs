import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { runCommand } from './command.mjs';

const defaultPreviewRoot = resolve(homedir(), '.local/share/jalsarabose/lan-preview');
const launchAgentLabel = 'com.jalsarabose.lan-preview';

async function git(run, args, cwd) {
  return run('git', args, { cwd });
}

async function waitForHealth({ fetchImpl = fetch, attempts = 60, delayMs = 1_000 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const [gateway, preview] = await Promise.all([
        fetchImpl('http://127.0.0.1:18787/health', { signal: AbortSignal.timeout(5_000) }),
        fetchImpl('http://127.0.0.1:19006/', { signal: AbortSignal.timeout(15_000) }),
      ]);
      if (gateway.ok && preview.ok) return true;
    } catch {
      // The Expo server commonly needs one full bundle before it can answer.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));
  }
  return false;
}

export function previewEligibility(summary, { dryRun = false, runFailed = false } = {}) {
  if (dryRun) return { eligible: false, reason: 'dry-run 실행' };
  if (runFailed) return { eligible: false, reason: '야간 실행 오류' };
  if (summary.status !== '성공') return { eligible: false, reason: `야간 상태 ${summary.status}` };
  if ((summary.ticketResults ?? []).some((item) => item.result !== '성공')) {
    return { eligible: false, reason: '실패·보류·미병합 티켓 존재' };
  }
  if ((summary.remainingQueue ?? []).length) return { eligible: false, reason: '미완료 야간 큐 존재' };
  if ((summary.pullRequests ?? []).some((item) => !item.endsWith(' merged'))) {
    return { eligible: false, reason: 'PR 병합 미확인' };
  }
  if (!(summary.pullRequests ?? []).length) {
    return { eligible: false, reason: '이번 실행에서 확인한 병합 PR 없음' };
  }
  if ((summary.verifiedPullRequests ?? []).length !== summary.pullRequests.length) {
    return { eligible: false, reason: '병합 커밋 SHA 미확인' };
  }
  return { eligible: true };
}

export function resolveRunVerifiedMainSha(summary) {
  const verifiedPullRequests = summary.verifiedPullRequests ?? [];
  const mergeSha = verifiedPullRequests.at(-1)?.mergeSha;
  if (!/^[0-9a-f]{40}$/i.test(mergeSha ?? '')) {
    throw new Error('이번 야간 실행이 확인한 PR 병합 커밋 SHA가 필요합니다.');
  }
  return mergeSha;
}

export async function refreshLanPreview({
  expectedSha,
  previewRoot = defaultPreviewRoot,
  fetchImpl = fetch,
  run = runCommand,
  healthCheckOptions = {},
} = {}) {
  if (!/^[0-9a-f]{40}$/i.test(expectedSha ?? '')) throw new Error('검증된 main SHA가 필요합니다.');
  if (!existsSync(previewRoot)) throw new Error('LAN preview checkout을 찾을 수 없습니다.');

  const status = await git(run, ['status', '--porcelain'], previewRoot);
  if (status.stdout.trim()) throw new Error('LAN preview에 보존되지 않은 로컬 변경이 있어 갱신하지 않았습니다.');
  const previousSha = (await git(run, ['rev-parse', 'HEAD'], previewRoot)).stdout.trim();

  await git(run, ['fetch', 'origin', 'main'], previewRoot);
  const remoteSha = (await git(run, ['rev-parse', 'origin/main'], previewRoot)).stdout.trim();
  if (remoteSha.toLowerCase() !== expectedSha.toLowerCase()) {
    throw new Error('이번 실행이 확인한 병합 SHA와 현재 origin/main이 달라 갱신하지 않았습니다.');
  }

  const restart = () => run('launchctl', [
    'kickstart', '-k', `gui/${process.getuid()}/${launchAgentLabel}`,
  ], { cwd: previewRoot });

  try {
    await git(run, ['switch', '--detach', expectedSha], previewRoot);
    await run('npm', ['ci', '--ignore-scripts'], { cwd: previewRoot, timeoutMs: 10 * 60_000 });
    await restart();
    if (!await waitForHealth({ fetchImpl, ...healthCheckOptions })) {
      throw new Error('재시작 후 health check 실패');
    }
    return { status: '반영', sha: expectedSha, sync: '성공', restart: '성공', health: '성공' };
  } catch (error) {
    const rollbackFailures = [];
    try {
      await git(run, ['switch', '--detach', previousSha], previewRoot);
    } catch (rollbackError) {
      rollbackFailures.push(`git switch: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
    }
    try {
      await run('npm', ['ci', '--ignore-scripts'], {
        cwd: previewRoot, timeoutMs: 10 * 60_000,
      });
    } catch (rollbackError) {
      rollbackFailures.push(`npm ci: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
    }
    try {
      await restart();
    } catch (rollbackError) {
      rollbackFailures.push(`restart: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
    }
    const rollbackHealthy = await waitForHealth({
      fetchImpl,
      attempts: 30,
      ...healthCheckOptions,
    });
    if (!rollbackHealthy) rollbackFailures.push('health check 실패');
    const failure = error instanceof Error ? error.message : String(error);
    const rollbackResult = rollbackFailures.length
      ? `실패 (${rollbackFailures.join('; ')})`
      : '성공';
    throw new Error(`${failure}; 이전 preview 롤백 ${rollbackResult}`);
  }
}
