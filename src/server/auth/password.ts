import { randomBytes, scrypt, type ScryptOptions, timingSafeEqual } from 'node:crypto';

/** promisify(scrypt) drops the options overload in the type defs, so wrap by hand. */
function scryptAsync(pw: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pw, salt, keylen, opts, (err, dk) => (err ? reject(err) : resolve(dk as Buffer)));
  });
}

/**
 * Password hashing for email/password accounts. Node's `scrypt` only — no
 * bcrypt/argon2 dependency (matches the rest of src/server/, which reaches for
 * stdlib crypto: see auth/session.ts, crypto.ts).
 *
 * Stored string: `scrypt$<N>$<r>$<p>$<salt-b64>$<hash-b64>`. The params travel
 * with the hash so they can be raised later without a migration (verify reads
 * the stored N/r/p; a re-hash on next login picks up the new defaults).
 *
 * Server-only.
 */

// ponytail: fixed cost, ~50-80ms on a Railway shared vCPU. Raise N (and re-hash
// on login) if that stops being enough. 128*N*r ≈ 16MB, under scrypt's 32MB cap.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

export function passwordPolicyError(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 200) return 'Password must be 200 characters or fewer.';
  return null;
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const dk = (await scryptAsync(pw, salt, KEYLEN, { N, r: R, p: P })) as Buffer;
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${dk.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  if (expected.length === 0) return false;
  const dk = (await scryptAsync(pw, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  })) as Buffer;
  return dk.length === expected.length && timingSafeEqual(dk, expected);
}
