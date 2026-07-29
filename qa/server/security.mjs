import { randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

const NONCE_TTL_MS = 30 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT = 10;

const nonces = new Map();
const rateBuckets = new Map();

function normalizeIp(rawIp = '') {
  return rawIp.replace(/^::ffff:/, '').split('%')[0];
}

export function isPrivateAddress(rawIp) {
  const ip = normalizeIp(rawIp);

  if (ip === '::1' || ip === '127.0.0.1') {
    return true;
  }

  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 127
    );
  }

  return ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:');
}

export function isAllowedOrigin(origin, expoPort) {
  if (!origin) {
    return false;
  }

  try {
    const url = new URL(origin);
    return (
      url.protocol === 'http:' &&
      Number(url.port || 80) === expoPort &&
      (url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        isPrivateAddress(url.hostname))
    );
  } catch {
    return false;
  }
}

export function issueNonce(ip, origin) {
  pruneExpired();
  const nonce = randomBytes(24).toString('base64url');
  nonces.set(nonce, {
    ip: normalizeIp(ip),
    origin,
    expiresAt: Date.now() + NONCE_TTL_MS,
  });
  return nonce;
}

export function consumeNonce(nonce, ip, origin) {
  pruneExpired();
  const session = typeof nonce === 'string' ? nonces.get(nonce) : undefined;

  if (!session) {
    return false;
  }

  const matches =
    safeEqual(session.ip, normalizeIp(ip)) &&
    safeEqual(session.origin, origin) &&
    session.expiresAt > Date.now();

  if (matches) {
    nonces.delete(nonce);
  }

  return matches;
}

export function checkRateLimit(ip) {
  const key = normalizeIp(ip);
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (bucket.count >= RATE_LIMIT) {
    return false;
  }

  bucket.count += 1;
  return true;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return (
    leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function pruneExpired() {
  const now = Date.now();
  for (const [nonce, session] of nonces) {
    if (session.expiresAt <= now) {
      nonces.delete(nonce);
    }
  }
  for (const [ip, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) {
      rateBuckets.delete(ip);
    }
  }
}

