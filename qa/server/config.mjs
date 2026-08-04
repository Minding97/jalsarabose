import { homedir } from 'node:os';
import { resolve } from 'node:path';

import dotenv from 'dotenv';

export const qaConfigPath =
  process.env.QA_CONFIG_PATH || resolve(homedir(), '.config/jalsarabose/qa.env');

dotenv.config({ path: qaConfigPath, quiet: true });

function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadQaConfig() {
  const config = {
    port: numberValue(process.env.QA_GATEWAY_PORT, 8787),
    expoPort: numberValue(process.env.QA_EXPO_PORT, 8081),
    jiraBaseUrl: process.env.JIRA_BASE_URL?.replace(/\/+$/, '') ?? '',
    jiraEmail: process.env.JIRA_EMAIL ?? '',
    jiraApiToken: process.env.JIRA_API_TOKEN ?? '',
    jiraProjectKey: process.env.JIRA_PROJECT_KEY ?? 'JAL',
    jiraReadyStatus: process.env.JIRA_READY_STATUS ?? '자동수정 대기',
    jiraInProgressStatus: process.env.JIRA_IN_PROGRESS_STATUS ?? '수정 중',
    jiraReviewStatus: process.env.JIRA_REVIEW_STATUS ?? '리뷰 중',
    jiraDoneStatus: process.env.JIRA_DONE_STATUS ?? '완료',
    jiraNeedsHumanStatus: process.env.JIRA_NEEDS_HUMAN_STATUS ?? '사람 확인 필요',
    jiraBugType: process.env.JIRA_BUG_TYPE ?? 'Bug',
    jiraTaskType: process.env.JIRA_TASK_TYPE ?? 'Task',
    jiraSubtaskType: process.env.JIRA_SUBTASK_TYPE ?? 'Sub-task',
    recordingKey: process.env.QA_RECORDING_KEY ?? '',
    githubRepository: process.env.GITHUB_REPOSITORY ?? 'Minding97/jalsarabose',
    appUrl: process.env.QA_APP_URL ?? 'http://127.0.0.1:8081',
    replayPort: numberValue(process.env.QA_REPLAY_PORT, 8091),
    testEmail: process.env.QA_TEST_EMAIL ?? '',
    testPassword: process.env.QA_TEST_PASSWORD ?? '',
    chromeExecutablePath:
      process.env.QA_CHROME_EXECUTABLE_PATH ??
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    nightlyEndHour: numberValue(process.env.QA_NIGHTLY_END_HOUR, 7),
    dailyQaHour: numberValue(process.env.QA_DAILY_HOUR, 7),
    dailyQaMinute: numberValue(process.env.QA_DAILY_MINUTE, 10),
    recordingRetentionDays: numberValue(process.env.QA_RECORDING_RETENTION_DAYS, 30),
  };

  return {
    ...config,
    jiraConfigured: Boolean(
      config.jiraBaseUrl &&
        config.jiraEmail &&
        config.jiraApiToken &&
        config.jiraProjectKey,
    ),
    recordingEncryptionConfigured: Boolean(config.recordingKey),
  };
}
