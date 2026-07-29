export type QaReportKind = 'bug' | 'task';

export type QaInteractionAction =
  | 'click'
  | 'input'
  | 'submit'
  | 'scroll'
  | 'navigation'
  | 'console-error'
  | 'network-error';

export type QaInteractionStep = {
  sequence: number;
  at: string;
  offsetMs: number;
  action: QaInteractionAction;
  path: string;
  selector?: string;
  label?: string;
  value?: string;
  detail?: string;
};

export type QaRecordingArtifact = {
  version: 1;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  rrwebEvents: unknown[];
  steps: QaInteractionStep[];
};

export type QaReportMetadata = {
  reportId: string;
  kind: QaReportKind;
  memo: string;
  reporter: string;
  path: string;
  userAgent: string;
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  appEnvironment: string;
  commitSha: string;
  createdAt: string;
  recordingIncluded: boolean;
  recordingStepCount: number;
  recordingDurationMs: number;
};

export type QaReportResponse = {
  reportId: string;
  ticketKey: string;
  ticketUrl: string;
  attachmentWarning?: string;
};

export type QaRecordingController = {
  stop: () => QaRecordingArtifact;
  cancel: () => void;
};

