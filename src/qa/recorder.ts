import { QaRecordingArtifact, QaRecordingController } from '@/qa/types';

export function startQaRecording(
  _onStep?: (count: number) => void,
  _onSizeLimit?: () => void,
): QaRecordingController {
  const startedAt = new Date().toISOString();

  const createEmptyArtifact = (): QaRecordingArtifact => ({
    version: 1,
    startedAt,
    endedAt: new Date().toISOString(),
    durationMs: 0,
    rrwebEvents: [],
    steps: [],
  });

  return {
    stop: createEmptyArtifact,
    cancel: () => undefined,
  };
}
