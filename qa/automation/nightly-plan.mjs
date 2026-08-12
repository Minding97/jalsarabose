import { spawn } from 'node:child_process';

const priorityOrder = new Map([
  ['highest', 0], ['high', 1], ['medium', 2], ['low', 3], ['lowest', 4],
]);

export function shouldStopForDeadline({ now, deadline, force, once, processedCount = 0 }) {
  return now >= deadline.getTime() && !once && (!force || processedCount > 0);
}

export function unsatisfiedDependencies(plan, issueKey, successfulKeys) {
  return (plan.dependencies.get(issueKey) ?? []).filter((key) => !successfulKeys.has(key));
}

export function isVerifiedCompletion(issue, pullRequest, doneStatus) {
  return issue?.fields?.status?.name === doneStatus
    && (pullRequest?.state === 'MERGED' || Boolean(pullRequest?.mergedAt));
}

export async function executePlannedIssue({
  plan,
  issue,
  successfulKeys,
  processIssue,
  holdIssue,
}) {
  const blockers = unsatisfiedDependencies(plan, issue.key, successfulKeys);
  if (blockers.length > 0) {
    await holdIssue(issue, blockers);
    return { held: true, succeeded: false };
  }
  const succeeded = await processIssue(issue);
  if (succeeded) successfulKeys.add(issue.key);
  return { held: false, succeeded };
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
    if (link.outwardIssue && /blocked by/i.test(link.type?.inward ?? '')) {
      return [link.outwardIssue.key];
    }
    return [];
  });
}

export function buildNightlyPlan(issues, config) {
  if (!Array.isArray(issues)) throw new Error('Jira queue snapshot is not an array.');
  const byKey = new Map(issues.map((issue) => [issue.key, issue]));
  const allDependencies = new Map(issues.map((issue) => [issue.key, dependencyKeys(issue)]));
  const actionable = new Set(byKey.keys());
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of actionable) {
      if (allDependencies.get(key).some((dependency) => !actionable.has(dependency))) {
        actionable.delete(key);
        changed = true;
      }
    }
  }
  const externallyBlockedKeys = [...byKey.keys()].filter((key) => !actionable.has(key)).sort();
  const dependencies = new Map(
    [...actionable].map((key) => [key, allDependencies.get(key).filter((dependency) => actionable.has(dependency))]),
  );
  const remaining = new Set(actionable);
  const ordered = [];
  let cyclicKeys = [];
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((key) => dependencies.get(key).every((dependency) => !remaining.has(dependency)))
      .map((key) => byKey.get(key))
      .sort(compareIssues);
    if (ready.length === 0) {
      cyclicKeys = [...remaining].sort();
      break;
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
    '후속 티켓은 같은 밤의 모든 선행 티켓이 Jira 완료 상태이고 PR merge까지 확인된 경우에만 실행합니다. 실패·사람 확인 필요·merge 미완료 선행 티켓의 downstream은 보류하고, 독립 티켓은 계속 처리합니다.',
    '',
    ...classifications.flatMap(({ issue, kind, basis, dependencies: deps }, index) => [
      `${index + 1}. ${issue.key} [${kind}] ${issue.fields?.summary ?? ''}`,
      `   근거: ${basis}; 우선순위 ${issue.fields?.priority?.name ?? '미지정'}${deps.length ? `; 선행 ${deps.join(', ')}` : ''}`,
      `   구현/검증: 티켓 설명·첨부 녹화를 재현하고 근본 원인을 수정한 뒤 회귀 테스트, qa:test, verify, 사후 녹화 재생을 수행합니다.`,
    ]),
    '',
    `제외/보류: ${[
      externallyBlockedKeys.length ? `큐 밖 미완료 선행조건 ${externallyBlockedKeys.join(', ')}` : '',
      cyclicKeys.length ? `의존 순환 ${cyclicKeys.join(', ')}` : '',
    ].filter(Boolean).join('; ') || (issues.length ? '현재 없음.' : '큐가 비어 있어 처리 항목 없음.')} 비순환·선행완료 항목만 실행합니다.`,
    '예상 위험: 불완전한 티켓 설명/녹화, 외부 서비스 불안정, 테스트 비결정성, 의존 링크 누락, 야간 종료시각 도달로 인한 미처리.',
    '이 보고 후 별도 승인 대기 없이 위 고정 순서대로 실행합니다.',
  ];
  const text = lines.join('\n');
  const ticketTexts = new Map(issues.map((issue) => [
    issue.key,
    [
      ordered.some(({ key }) => key === issue.key)
        ? `야간 자동수정 고정 계획에서 ${ordered.findIndex(({ key }) => key === issue.key) + 1}/${ordered.length} 순서로 배정되었습니다.`
        : `야간 자동수정 계획에서 보류되었습니다${cyclicKeys.includes(issue.key) ? ' (의존 순환)' : ' (큐 밖 미완료 선행조건)'}.`,
      `${issue.key} ${issue.fields?.summary ?? ''}`,
      `우선순위 ${issue.fields?.priority?.name ?? '미지정'}${allDependencies.get(issue.key).length ? `; 선행 ${allDependencies.get(issue.key).join(', ')}` : ''}`,
      '실행 중 새 티켓은 오늘 계획에 추가하지 않으며, 모든 선행 티켓의 Jira 완료 및 PR merge가 확인된 경우에만 실행합니다. 선행 실패·사람 확인 필요·merge 미완료 시 보류됩니다.',
    ].join('\n'),
  ]));
  return { issues: ordered, reportIssues: issues, text, ticketTexts, dependencies: allDependencies, cyclicKeys, externallyBlockedKeys, counts: { total: issues.length, task: taskCount, bug: bugCount, other: otherCount } };
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
  const commentResults = await Promise.allSettled(
    plan.reportIssues.map((issue) => jira.addComment(issue.key, plan.ticketTexts.get(issue.key))),
  );
  const failedIssues = plan.reportIssues.filter((_issue, index) => commentResults[index].status === 'rejected');
  if (failedIssues.length === 0) {
    console.log(`Nightly plan reported to ${plan.reportIssues.length} Jira ticket(s).`);
    return 'jira';
  }
  const succeededCount = plan.reportIssues.length - failedIssues.length;
  failures.push(`Jira: ${failedIssues.map(({ key }) => key).join(', ')} failed`);
  console.error(`Nightly plan Jira report partially failed (${succeededCount} succeeded, ${failedIssues.length} failed); trying configured fallback.`);
  const fallbackText = failedIssues.map((issue) => plan.ticketTexts.get(issue.key)).join('\n\n---\n\n');
  if (config.nightlyPlanWebhookUrl) {
    try {
      const response = await fetchImpl(config.nightlyPlanWebhookUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: fallbackText }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return 'webhook';
    } catch (error) { failures.push(`webhook: ${error.message}`); }
  }
  if (config.nightlyPlanCommand) {
    try { await runReportCommand(config.nightlyPlanCommand, fallbackText); return 'command'; }
    catch (error) { failures.push(`command: ${error.message}`); }
  }
  console.error(`Nightly plan external reporting exhausted: ${failures.join('; ')}. Continuing with the locally logged fixed plan.`);
  return 'local-log';
}
