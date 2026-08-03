import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { qaConfigPath } from './server/config.mjs';

const defaults = [
  '# 잘살아보세 내부망 QA 전용 설정',
  '# 이 파일은 앱 번들과 git 저장소에 포함되지 않습니다.',
  'JIRA_BASE_URL=https://YOUR-SITE.atlassian.net',
  'JIRA_EMAIL=',
  'JIRA_API_TOKEN=',
  'JIRA_PROJECT_KEY=JAL',
  'JIRA_READY_STATUS=자동수정 대기',
  'JIRA_IN_PROGRESS_STATUS=수정 중',
  'JIRA_REVIEW_STATUS=리뷰 중',
  'JIRA_DONE_STATUS=완료',
  'JIRA_NEEDS_HUMAN_STATUS=사람 확인 필요',
  'JIRA_BUG_TYPE=Bug',
  'JIRA_TASK_TYPE=Task',
  'JIRA_SUBTASK_TYPE=Sub-task',
  `QA_RECORDING_KEY=${randomBytes(32).toString('base64')}`,
  'QA_GATEWAY_PORT=8787',
  'QA_EXPO_PORT=8081',
  'QA_REPLAY_PORT=8091',
  'QA_APP_URL=http://127.0.0.1:8081',
  'QA_TEST_EMAIL=',
  'QA_TEST_PASSWORD=',
  'GITHUB_REPOSITORY=Minding97/jalsarabose',
  'QA_NIGHTLY_END_HOUR=7',
  'QA_RECORDING_RETENTION_DAYS=30',
  '',
].join('\n');

mkdirSync(dirname(qaConfigPath), { recursive: true, mode: 0o700 });

if (!existsSync(qaConfigPath)) {
  writeFileSync(qaConfigPath, defaults, { mode: 0o600 });
  console.log(`Created QA config: ${qaConfigPath}`);
} else {
  const current = readFileSync(qaConfigPath, 'utf8');
  const additions = [];
  if (!current.includes('QA_RECORDING_KEY=')) {
    additions.push(`QA_RECORDING_KEY=${randomBytes(32).toString('base64')}`);
  }
  if (!current.includes('JIRA_BUG_TYPE=')) {
    additions.push('JIRA_BUG_TYPE=Bug');
  }
  if (!current.includes('JIRA_TASK_TYPE=')) {
    additions.push('JIRA_TASK_TYPE=Task');
  }
  if (!current.includes('QA_REPLAY_PORT=')) {
    additions.push('QA_REPLAY_PORT=8091');
  }
  if (!current.includes('QA_TEST_EMAIL=')) {
    additions.push('QA_TEST_EMAIL=');
  }
  if (!current.includes('QA_TEST_PASSWORD=')) {
    additions.push('QA_TEST_PASSWORD=');
  }

  if (additions.length > 0) {
    writeFileSync(
      qaConfigPath,
      `${current.trimEnd()}\n${additions.join('\n')}\n`,
      { mode: 0o600 },
    );
    console.log(`Added missing QA settings: ${qaConfigPath}`);
  } else {
    console.log(`QA config already exists: ${qaConfigPath}`);
  }
}

console.log('Fill JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN before starting qa:lan.');
