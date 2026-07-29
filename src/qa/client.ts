import { QaRecordingArtifact, QaReportMetadata, QaReportResponse } from '@/qa/types';

const QA_GATEWAY_PORT = 8787;

function getGatewayUrl() {
  if (typeof window === 'undefined') {
    throw new Error('QA 제보는 내부망 웹에서만 사용할 수 있어요.');
  }

  const configuredUrl = process.env.EXPO_PUBLIC_QA_GATEWAY_URL?.trim();
  return configuredUrl || `${window.location.protocol}//${window.location.hostname}:${QA_GATEWAY_PORT}`;
}

async function getQaSession() {
  const response = await fetch(`${getGatewayUrl()}/api/qa/session`, {
    headers: {
      Accept: 'application/json',
    },
  });
  const payload = (await response.json()) as { nonce?: string; error?: string };

  if (!response.ok || !payload.nonce) {
    throw new Error(payload.error || 'QA 게이트웨이에 연결하지 못했어요.');
  }

  return payload.nonce;
}

export async function submitQaReport(
  metadata: QaReportMetadata,
  recording: QaRecordingArtifact | null,
): Promise<QaReportResponse> {
  const nonce = await getQaSession();
  const form = new FormData();
  form.append('metadata', JSON.stringify(metadata));

  if (recording) {
    form.append(
      'recording',
      new Blob([JSON.stringify(recording)], { type: 'application/json' }),
      `session-${metadata.reportId}.json`,
    );
  }

  const response = await fetch(`${getGatewayUrl()}/api/reports`, {
    method: 'POST',
    headers: {
      'X-QA-Nonce': nonce,
    },
    body: form,
  });
  const payload = (await response.json()) as QaReportResponse & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || 'QA 티켓을 생성하지 못했어요.');
  }

  return payload;
}

export function createQaReportId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function isQaMode() {
  return process.env.EXPO_PUBLIC_QA_MODE === 'true';
}
