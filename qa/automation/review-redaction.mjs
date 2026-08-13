import { redactSecrets } from '../server/sanitize.mjs';

export function redactReviewEvidence(value) {
  return redactSecrets(String(value))
    .replace(/-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )?PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]')
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[REDACTED AWS ACCESS KEY]')
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^@\s/]+@/gi, '$1[REDACTED]@')
    .replace(/authorization\s*:\s*Bearer\s+\S+/gi, 'Authorization: Bearer [REDACTED]')
    .replace(/(authorization|api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,};]+/gi, '$1=[REDACTED]')
    .replace(/\b(?:sk-|gh[op]_|xox[baprs]-)[-A-Za-z0-9_]{12,}\b/g, '[REDACTED]')
    .replace(/\b(?=[A-Za-z0-9+/]{40,}={0,2}\b)(?=[A-Za-z0-9+/]*[A-Z])(?=[A-Za-z0-9+/]*[a-z])(?=[A-Za-z0-9+/]*\d)[A-Za-z0-9+/]{40,}={0,2}\b/g, '[REDACTED OPAQUE VALUE]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}

export function redactReviewValue(value) {
  if (typeof value === 'string') return redactReviewEvidence(value);
  if (Array.isArray(value)) return value.map(redactReviewValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactReviewValue(item)]));
  }
  return value;
}
