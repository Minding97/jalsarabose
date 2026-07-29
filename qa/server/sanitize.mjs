const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\b(?:ghp|github_pat|sk-ant|sk-proj)-[A-Za-z0-9_-]+\b/g,
  /(?:authorization|cookie|set-cookie|(?:access|refresh|id|api)[_-]?token)\s*[:=]\s*[^\s,;]+/gi,
];
const SECRET_KEYS = /^(authorization|cookie|set-cookie|accessToken|refreshToken|idToken|apiToken)$/i;

export function redactSecrets(value) {
  let result = String(value ?? '');
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

export function sanitizeRecordingForStorage(value, key = '') {
  if (SECRET_KEYS.test(key)) {
    return '[REDACTED]';
  }

  if (typeof value === 'string') {
    return redactSecrets(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeRecordingForStorage(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeRecordingForStorage(entryValue, entryKey),
      ]),
    );
  }

  return value;
}

export function createSafeTrace(recording) {
  return {
    version: recording.version,
    startedAt: recording.startedAt,
    endedAt: recording.endedAt,
    durationMs: recording.durationMs,
    steps: Array.isArray(recording.steps)
      ? recording.steps.map((step) => ({
          sequence: step.sequence,
          at: step.at,
          offsetMs: step.offsetMs,
          action: step.action,
          path: redactSecrets(step.path),
          selector: step.selector,
          label: step.label,
          detail: redactSecrets(step.detail),
          valueCaptured: typeof step.value === 'string',
        }))
      : [],
  };
}
