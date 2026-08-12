import { spawn } from 'node:child_process';

const priorityOrder = new Map([
  ['highest', 0], ['high', 1], ['medium', 2], ['low', 3], ['lowest', 4],
]);

export function shouldStopForDeadline({ now, deadline, force, once }) {
  return now >= deadline.getTime() && !force && !once;
}

function stableRank(issue) {
  return [
    priorityOrder.get(issue.fields?.priority?.name?.toLowerCase()) ?? 99,
    issue.fields?.created ?? '',
    issue.key,
  ];
}

function compareIssues(left, right) {
  const a = stableRank(left);
  const b = stableRank(right);
  return a[0] - b[0] || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]);
}

function dependencyKeys(issue) {
  return (issue.fields?.issuelinks ?? []).flatMap((link) => {
    if (link.inwardIssue && /blocked by/i.test(link.type?.inward ?? '')) {
      return [link.inwardIssue.key];
    }
    return [];
  });
}

export function buildNightlyPlan(issues, config) {
  if (!Array.isArray(issues)) throw new Error('Jira queue snapshot is not an array.');
  const byKey = new Map(issues.map((issue) => [issue.key, issue]));
  const dependencies = new Map(
    issues.map((issue) => [issue.key, dependencyKeys(issue).filter((key) => byKey.has(key))]),
  );
  const remaining = new Set(byKey.keys());
  const ordered = [];
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((key) => dependencies.get(key).every((dependency) => !remaining.has(dependency)))
      .map((key) => byKey.get(key))
      .sort(compareIssues);
    if (ready.length === 0) {
      throw new Error(`Dependency cycle in nightly queue: ${[...remaining].sort().join(', ')}`);
    }
    for (const issue of ready) {
      ordered.push(issue);
      remaining.delete(issue.key);
    }
  }

  const bugType = config.jiraBugType.toLowerCase();
  const taskType = config.jiraTaskType.toLowerCase();
  const classifications = ordered.map((issue) => {
    const actual = issue.fields?.issuetype?.name ?? 'Unknown';
    const normalized = actual.toLowerCase();
    return {
      issue,
      kind: normalized === bugType ? 'bug' : normalized === taskType ? 'task' : 'other',
      basis: normalized === bugType || normalized === taskType
        ? `Jira issue type: ${actual}`
        : `Jira issue type '${actual}' does not match configured Task/Bug types`,
      dependencies: dependencies.get(issue.key),
    };
  });
  const taskCount = classifications.filter(({ kind }) => kind === 'task').length;
  const bugCount = classifications.filter(({ kind }) => kind === 'bug').length;
  const otherCount = classifications.length - taskCount - bugCount;
  const lines = [
    `야간 자동수정 고정 계획 (${new Date().toISOString()})`,
    `전체 ${issues.length}건 · Task ${taskCount}건 · Bug ${bugCount}건${otherCount ? ` · 기타/불명확 ${otherCount}건` : ''}`,
    '실행 중 새 티켓은 오늘 계획에 추가하지 않습니다. Jira 의존 링크를 먼저 반영하고, 동순위는 priority → created → key 순입니다.',
    '',
    ...classifications.flatMap(({ issue, kind, basis, dependencies: deps }, index) => [
      `${index + 1}. ${issue.key} [${kind}] ${issue.fields?.summary ?? ''}`,
      `   근거: ${basis}; 우선순위 ${issue.fields?.priority?.name ?? '미지정'}${deps.length ? `; 선행 ${deps.join(', ')}` : ''}`,
      `   구현/검증: 티켓 설명·첨부 녹화를 재현하고 근본 원인을 수정한 뒤 회귀 테스트, qa:test, verify, 사후 녹화 재생을 수행합니다.`,
    ]),
    '',
    `제외/보류: ${issues.length ? '현재 없음. 의존 순환이 발견되면 무계획 실행하지 않고 전체를 안전 중단합니다.' : '큐가 비어 있어 처리 항목 없음.'}`,
    '예상 위험: 불완전한 티켓 설명/녹화, 외부 서비스 불안정, 테스트 비결정성, 의존 링크 누락, 야간 종료시각 도달로 인한 미처리.',
    '이 보고 후 별도 승인 대기 없이 위 고정 순서대로 실행합니다.',
  ];
  return { issues: ordered, text: lines.join('\n'), counts: { total: issues.length, task: taskCount, bug: bugCount, other: otherCount } };
}

function runReportCommand(command, text) {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-c', command], { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`report command exited ${code}: ${stderr.slice(0, 500)}`)));
    child.stdin.end(text);
  });
}

export async function reportNightlyPlan({ jira, plan, config, dryRun = false, fetchImpl = fetch }) {
  if (dryRun) {
    console.log(`[dry-run] nightly plan\n${plan.text}`);
    return 'dry-run';
  }
  const failures = [];
  try {
    await Promise.all(plan.issues.map((issue) => jira.addComment(issue.key, plan.text)));
    console.log(`Nightly plan reported to ${plan.issues.length} Jira ticket(s).`);
    return 'jira';
  } catch (error) {
    failures.push(`Jira: ${error.message}`);
    console.error('Nightly plan Jira report failed; trying configured fallback:', error.message);
  }
  if (config.nightlyPlanWebhookUrl) {
    try {
      const response = await fetchImpl(config.nightlyPlanWebhookUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: plan.text }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return 'webhook';
    } catch (error) { failures.push(`webhook: ${error.message}`); }
  }
  if (config.nightlyPlanCommand) {
    try { await runReportCommand(config.nightlyPlanCommand, plan.text); return 'command'; }
    catch (error) { failures.push(`command: ${error.message}`); }
  }
  console.error(`Nightly plan external reporting exhausted: ${failures.join('; ')}. Continuing with the locally logged fixed plan.`);
  return 'local-log';
}
