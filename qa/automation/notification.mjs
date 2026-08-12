import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';

import { redactSecrets } from '../server/sanitize.mjs';
import { runCommand } from './command.mjs';

const deliveryStatePath = resolve(homedir(), '.local/state/jalsarabose/qa-notification-last.json');

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

export async function notifyAutomationSummary({ summary, config, dryRun = false, statePath = deliveryStatePath }) {
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
  const result = await runCommand(
    config.openclawCliPath || 'openclaw',
    ['message', 'send', '--channel', 'telegram', '--target', config.telegramTarget, '--message', message, '--json', ...(dryRun ? ['--dry-run'] : [])],
    { sensitive: true, maxCaptureBytes: 256 * 1024, timeoutMs: 30_000 },
  );
  if (!dryRun) {
    mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 });
    writeFileSync(statePath, `${JSON.stringify({ runId: summary.runId, deliveredAt: new Date().toISOString(), channel: 'telegram', target: config.telegramTarget }, null, 2)}\n`, { mode: 0o600 });
  }
  return result.stdout;
}
