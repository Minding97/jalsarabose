import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const MAGIC = Buffer.from('JALQA1');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function parseRecordingKey(rawKey) {
  if (!rawKey) {
    throw new Error('QA_RECORDING_KEY is required.');
  }

  const key = /^[a-f0-9]{64}$/i.test(rawKey)
    ? Buffer.from(rawKey, 'hex')
    : Buffer.from(rawKey, 'base64');

  if (key.length !== 32) {
    throw new Error('QA_RECORDING_KEY must decode to exactly 32 bytes.');
  }

  return key;
}

export function encryptRecording(data, rawKey) {
  const key = parseRecordingKey(rawKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, encrypted]);
}

export function decryptRecording(data, rawKey) {
  if (!data.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Unsupported QA recording envelope.');
  }

  const key = parseRecordingKey(rawKey);
  const ivStart = MAGIC.length;
  const tagStart = ivStart + IV_LENGTH;
  const payloadStart = tagStart + TAG_LENGTH;
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    data.subarray(ivStart, tagStart),
  );
  decipher.setAuthTag(data.subarray(tagStart, payloadStart));
  return Buffer.concat([decipher.update(data.subarray(payloadStart)), decipher.final()]);
}

