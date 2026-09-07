import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM for OAuth tokens at rest (`db/010_oauth_tokens.sql`, `bytea`).
 *
 * Server-only — imported by `src/server/google/*` and the auth routes, never the
 * app bundle. Ciphertext layout: iv(12) ‖ authTag(16) ‖ data.
 *
 * Key: `TOKEN_ENC_KEY`, base64 of 32 random bytes (`openssl rand -base64 32`).
 * Rotation is out of scope — see the plan's deferred list.
 */

const IV_LEN = 12;
const TAG_LEN = 16;

function key(): Buffer {
  const raw = process.env.TOKEN_ENC_KEY;
  if (!raw) throw new Error('TOKEN_ENC_KEY is not set — cannot encrypt OAuth tokens.');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error(`TOKEN_ENC_KEY must be 32 bytes base64 (got ${buf.length}).`);
  }
  return buf;
}

export function isCryptoConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function encrypt(plain: string): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]);
}

export function decrypt(buf: Buffer): string {
  if (buf.length < IV_LEN + TAG_LEN) throw new Error('ciphertext too short');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
