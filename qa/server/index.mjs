import { gzipSync } from 'node:zlib';

import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { z } from 'zod';

import { loadQaConfig, qaConfigPath } from './config.mjs';
import { encryptRecording, parseRecordingKey } from './crypto.mjs';
import { JiraClient } from './jira-client.mjs';
import { createSafeTrace, sanitizeRecordingForStorage } from './sanitize.mjs';
import {
  checkRateLimit,
  consumeNonce,
  isAllowedOrigin,
  isPrivateAddress,
  issueNonce,
} from './security.mjs';

const MAX_COMPRESSED_RECORDING_BYTES = 5 * 1024 * 1024;
const config = loadQaConfig();
const jira = config.jiraConfigured ? new JiraClient(config) : null;
const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024,
    files: 1,
    fields: 4,
  },
});

const metadataSchema = z.object({
  reportId: z.string().uuid(),
  kind: z.enum(['bug', 'task']),
  memo: z.string().trim().min(5).max(500),
  reporter: z.string().trim().min(2).max(30),
  path: z.string().max(1000),
  userAgent: z.string().max(1000),
  viewport: z.object({
    width: z.number().int().positive().max(10000),
    height: z.number().int().positive().max(10000),
    devicePixelRatio: z.number().positive().max(10),
  }),
  appEnvironment: z.string().max(50),
  commitSha: z.string().max(100),
  createdAt: z.string().datetime(),
  recordingIncluded: z.boolean(),
  recordingStepCount: z.number().int().nonnegative().max(10000),
  recordingDurationMs: z.number().int().nonnegative().max(5 * 60 * 1000 + 5000),
});

app.disable('x-powered-by');
app.use(
  cors({
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin, config.expoPort));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-QA-Nonce'],
  }),
);

app.use((request, response, next) => {
  const origin = request.get('origin');

  if (!isPrivateAddress(request.socket.remoteAddress)) {
    response.status(403).json({ error: 'QA 게이트웨이는 허용된 내부망 앱에서만 사용할 수 있어요.' });
    return;
  }

  if (request.path !== '/health' && !isAllowedOrigin(origin, config.expoPort)) {
    response.status(403).json({ error: '허용되지 않은 QA 앱 Origin이에요.' });
    return;
  }

  next();
});

app.get('/health', (_request, response) => {
  response.json({
    ok: true,
    jiraConfigured: config.jiraConfigured,
    recordingEncryptionConfigured: config.recordingEncryptionConfigured,
    configPath: qaConfigPath,
  });
});

app.get('/api/qa/session', (request, response) => {
  response.json({
    nonce: issueNonce(request.socket.remoteAddress, request.get('origin')),
    expiresInSeconds: 1800,
  });
});

app.post('/api/reports', upload.single('recording'), async (request, response) => {
  if (!checkRateLimit(request.socket.remoteAddress)) {
    response.status(429).json({ error: '한 시간 제보 한도를 초과했어요.' });
    return;
  }

  if (
    !consumeNonce(
      request.get('X-QA-Nonce'),
      request.socket.remoteAddress,
      request.get('origin'),
    )
  ) {
    response.status(403).json({ error: 'QA 세션이 만료됐어요. 다시 시도해주세요.' });
    return;
  }

  if (!jira) {
    response.status(503).json({
      error: `Jira 설정이 필요해요. ${qaConfigPath} 파일을 확인해주세요.`,
    });
    return;
  }

  if (!config.recordingEncryptionConfigured) {
    response.status(503).json({
      error: `QA_RECORDING_KEY 설정이 필요해요. ${qaConfigPath} 파일을 확인해주세요.`,
    });
    return;
  }

  try {
    parseRecordingKey(config.recordingKey);
    const metadata = metadataSchema.parse(JSON.parse(request.body.metadata));
    const existingIssue = await jira.findReport(metadata.reportId);
    const issue = existingIssue
      ? await jira.getIssue(existingIssue.key)
      : await jira.createReport(metadata);
    let attachmentWarning;

    if (request.file) {
      try {
        const recording = sanitizeRecordingForStorage(
          JSON.parse(request.file.buffer.toString('utf8')),
        );
        const recordingBuffer = Buffer.from(JSON.stringify(recording), 'utf8');
        const compressed = gzipSync(recordingBuffer, { level: 9 });

        if (compressed.byteLength > MAX_COMPRESSED_RECORDING_BYTES) {
          throw new Error('압축된 Recording이 5MiB를 초과했어요.');
        }

        const encrypted = encryptRecording(compressed, config.recordingKey);
        const safeTrace = Buffer.from(
          JSON.stringify(createSafeTrace(recording), null, 2),
          'utf8',
        );
        const attachmentNames = new Set(
          (issue.fields?.attachment ?? []).map((attachment) => attachment.filename),
        );
        const recordingFilename = `session-${metadata.reportId}.json.gz.enc`;
        const traceFilename = `trace-${metadata.reportId}.json`;

        if (!attachmentNames.has(recordingFilename)) {
          await jira.attach(issue.key, recordingFilename, encrypted);
        }
        if (!attachmentNames.has(traceFilename)) {
          await jira.attach(issue.key, traceFilename, safeTrace, 'application/json');
        }
      } catch (error) {
        attachmentWarning =
          error instanceof Error ? error.message : 'Recording 첨부에 실패했어요.';
        await jira.addComment(issue.key, `Recording 첨부 경고: ${attachmentWarning}`);
      }
    }

    response.status(existingIssue ? 200 : 201).json({
      reportId: metadata.reportId,
      ticketKey: issue.key,
      ticketUrl: `${config.jiraBaseUrl}/browse/${issue.key}`,
      attachmentWarning,
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues.map((issue) => issue.message).join(', ')
        : error instanceof Error
          ? error.message
          : 'QA 티켓 생성 중 오류가 발생했어요.';
    response.status(400).json({ error: message });
  }
});

app.use((error, _request, response, _next) => {
  const message =
    error instanceof multer.MulterError
      ? 'Recording 파일이 허용 크기를 초과했어요.'
      : error instanceof Error
        ? error.message
        : 'QA 게이트웨이 오류가 발생했어요.';
  response.status(400).json({ error: message });
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`QA gateway listening on http://0.0.0.0:${config.port}`);
  console.log(
    config.jiraConfigured
      ? `Jira project: ${config.jiraProjectKey}`
      : `Jira is not configured. Run npm run qa:setup (${qaConfigPath}).`,
  );
});
