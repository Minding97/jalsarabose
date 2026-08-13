import { redactSecrets } from '../server/sanitize.mjs';

export function redactReviewEvidence(value) {
  return redactSecrets(String(value))
    .replace(/authorization\s*:\s*Bearer\s+\S+/gi, 'Authorization: Bearer [REDACTED]')
    .replace(/(authorization|api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,};]+/gi, '$1=[REDACTED]')
    .replace(/\b(?:sk-|gh[op]_|xox[baprs]-)[-A-Za-z0-9_]{12,}\b/g, '[REDACTED]')
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
