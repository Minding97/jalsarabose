import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';

import { redactSecrets } from '../server/sanitize.mjs';
import { runCommand } from './command.mjs';

const deliveryStatePath = resolve(homedir(), '.local/state/jalsarabose/qa-notification-last.json');
const deliveryLedgerDirectory = resolve(homedir(), '.local/state/jalsarabose/qa-notification-deliveries');

export function isTestNotificationRun({ dryRun, explicitTestNotification = false }) {
  return Boolean(dryRun || explicitTestNotification);
}

function lineList(values, empty = '없음') {
  return values?.length ? values.join(', ') : empty;
}

export function sanitizeNotificationFailure(value, sensitiveValues = []) {
  let safe = redactSecrets(String(value));
  for (const sensitiveValue of sensitiveValues.filter(Boolean)) {
    safe = safe.replaceAll(String(sensitiveValue), '[REDACTED]');
  }
  return safe
    .split(/\r?\n/, 1)[0]
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
    .replace(/https?:\/\/\S+/gi, '[URL]')
    .replace(/\/(?:Users|private|var|tmp)\/\S+/g, '[PATH]')
    .replace(/\b[A-Za-z0-9_=-]{24,}\b/g, '[REDACTED]')
    .slice(0, 240);
}

export function formatAutomationSummary(summary, sensitiveValues = []) {
  const isNightly = summary.kind === 'nightly';
  const productionTitle = isNightly ? '🌙 야간 개발 완료' : '🧪 일일 자동 테스트 완료';
  const title = summary.testNotification ? `🧪 시험 알림 · ${productionTitle}` : productionTitle;
  const lines = [
    `${title} · ${summary.status}`,
    `실행: ${summary.startedAt} → ${summary.completedAt}`,
  ];
  if (isNightly) {
    lines.push(`계획: ${lineList(summary.plannedTickets)}`);
    lines.push(`처리: ${lineList(summary.ticketResults?.map((item) => `${item.key}=${item.result}`))}`);
    lines.push(`PR/병합: ${lineList(summary.pullRequests)}`);
    lines.push(`리뷰 제공자/게이트: ${lineList(summary.reviewGates)}`);
    lines.push(`후속 결과: ${lineList(summary.lateOutcomes)}`);
  } else {
    lines.push(`대상: main@${summary.commitSha?.slice(0, 8) || '확인 실패'}`);
    lines.push(`테스트: ${lineList(summary.suites?.map((item) => `${item.name}=${item.passed ? 'PASS' : 'FAIL'}`))}`);
    lines.push(`Jira: ${lineList(summary.reports?.map((item) => `${item.suite}=${item.issueKey || item.action}`))}`);
  }
  lines.push(`검증: ${summary.verification || '완료 데이터 없음'}`);
  lines.push(`실패/차단: ${lineList(summary.failures?.map((value) => sanitizeNotificationFailure(value, sensitiveValues)))}`);
  lines.push(`남은 큐: ${lineList(summary.remainingQueue)}`);
  lines.push(`다음 조치: ${summary.nextAction || '다음 예약 실행에서 재확인'}`);
  return redactSecrets(lines.join('\n')).slice(0, 3900);
}

function findMessageId(value) {
  if (!value || typeof value !== 'object') return null;
  for (const key of ['messageId', 'message_id', 'id']) {
    if (typeof value[key] === 'number' || typeof value[key] === 'string') return value[key];
  }
  for (const child of Object.values(value)) {
    const found = findMessageId(child);
    if (found !== null) return found;
  }
  return null;
}

function parseDeliveryEvidence(stdout) {
  try {
    return { messageId: findMessageId(JSON.parse(stdout)) };
  } catch {
    return { messageId: null };
  }
}

function ledgerPathForRun(deliveryKey) {
  const digest = createHash('sha256').update(deliveryKey).digest('hex');
  return resolve(deliveryLedgerDirectory, `${digest}.json`);
}

export function buildNotificationDeliveryKey(summary) {
  const { runId: _runId, startedAt: _startedAt, completedAt: _completedAt, ...stable } = summary;
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

export async function notifyAutomationSummary({ summary, config, dryRun = false, statePath }) {
  if (!config.telegramTarget) {
    throw new Error('QA_TELEGRAM_TARGET is required for automation completion notifications.');
  }
  const message = formatAutomationSummary(summary, [
    config.testEmail,
    config.testPassword,
    config.jiraEmail,
    config.jiraApiToken,
    config.recordingKey,
  ]);
  const deliveryKey = buildNotificationDeliveryKey(summary);
  const evidencePath = statePath ?? ledgerPathForRun(deliveryKey);
  const lockPath = `${evidencePath}.lock`;
  mkdirSync(dirname(evidencePath), { recursive: true, mode: 0o700 });
  let lock;
  try {
    lock = openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') return 'already-in-progress';
    throw error;
  }
  try {
    if (!dryRun && existsSync(evidencePath)) {
      const prior = JSON.parse(readFileSync(evidencePath, 'utf8'));
      if (prior.deliveryKey === deliveryKey && prior.status === 'delivered') return 'already-delivered';
    }
    const result = await runCommand(
      config.openclawCliPath || 'openclaw',
      ['message', 'send', '--channel', 'telegram', '--target', config.telegramTarget, '--message', message, '--json', ...(dryRun ? ['--dry-run'] : [])],
      { sensitive: true, maxCaptureBytes: 256 * 1024, timeoutMs: 30_000 },
    );
    if (!dryRun) {
      const evidence = {
        runId: summary.runId,
        deliveryKey,
        status: 'delivered',
        deliveredAt: new Date().toISOString(),
        channel: 'telegram',
        target: config.telegramTarget,
        ...parseDeliveryEvidence(result.stdout),
      };
      writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
      if (!statePath) writeFileSync(deliveryStatePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    }
    return result.stdout;
  } finally {
    if (lock !== undefined) closeSync(lock);
    rmSync(lockPath, { force: true });
  }
}
