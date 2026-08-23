import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { runCommand } from './command.mjs';

const defaultPreviewRoot = resolve(homedir(), '.local/share/jalsarabose/lan-preview');
const launchAgentLabel = 'com.jalsarabose.lan-preview';

async function git(args, cwd) {
  return runCommand('git', args, { cwd });
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
  return { eligible: true };
}

export async function refreshLanPreview({
  expectedSha,
  previewRoot = defaultPreviewRoot,
  fetchImpl = fetch,
  run = runCommand,
} = {}) {
  if (!/^[0-9a-f]{40}$/i.test(expectedSha ?? '')) throw new Error('검증된 main SHA가 필요합니다.');
  if (!existsSync(previewRoot)) throw new Error('LAN preview checkout을 찾을 수 없습니다.');

  const status = await git(['status', '--porcelain'], previewRoot);
  if (status.stdout.trim()) throw new Error('LAN preview에 보존되지 않은 로컬 변경이 있어 갱신하지 않았습니다.');
  const previousSha = (await git(['rev-parse', 'HEAD'], previewRoot)).stdout.trim();

  await git(['fetch', 'origin', 'main'], previewRoot);
  const remoteSha = (await git(['rev-parse', 'origin/main'], previewRoot)).stdout.trim();
  if (remoteSha !== expectedSha) throw new Error('검증 SHA와 현재 origin/main이 달라 갱신하지 않았습니다.');

  const restart = () => run('launchctl', [
    'kickstart', '-k', `gui/${process.getuid()}/${launchAgentLabel}`,
  ], { cwd: previewRoot });

  try {
    await git(['switch', '--detach', expectedSha], previewRoot);
    await run('npm', ['ci', '--ignore-scripts'], { cwd: previewRoot, timeoutMs: 10 * 60_000 });
    await restart();
    if (!await waitForHealth({ fetchImpl })) throw new Error('재시작 후 health check 실패');
    return { status: '반영', sha: expectedSha, sync: '성공', restart: '성공', health: '성공' };
  } catch (error) {
    await git(['switch', '--detach', previousSha], previewRoot).catch(() => undefined);
    await run('npm', ['ci', '--ignore-scripts'], {
      cwd: previewRoot, timeoutMs: 10 * 60_000, allowFailure: true,
    });
    await restart().catch(() => undefined);
    const rollbackHealthy = await waitForHealth({ fetchImpl, attempts: 30 });
    const failure = error instanceof Error ? error.message : String(error);
    throw new Error(`${failure}; 이전 preview 롤백 ${rollbackHealthy ? '성공' : 'health 실패'}`);
  }
}

export async function resolveVerifiedMainSha(repositoryRoot) {
  await git(['fetch', 'origin', 'main'], repositoryRoot);
  return (await git(['rev-parse', 'origin/main'], repositoryRoot)).stdout.trim();
}
