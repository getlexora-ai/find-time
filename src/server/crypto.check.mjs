/**
 * Self-check for src/server/crypto.ts. No test runner:
 *   TOKEN_ENC_KEY=$(openssl rand -base64 32) node src/server/crypto.check.mjs
 */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';

process.env.TOKEN_ENC_KEY ??= randomBytes(32).toString('base64');

const { encrypt, decrypt, isCryptoConfigured } = await import('./crypto.ts');

assert.equal(isCryptoConfigured(), true);

// round-trip, including unicode and a long refresh-token-shaped string
for (const s of ['', 'x', 'ya29.a0Af…-_secret', '🔑 unicode ' + 'z'.repeat(500)]) {
  assert.equal(decrypt(encrypt(s)), s);
}

// two encryptions of the same plaintext differ (random IV) but both decrypt
const a = encrypt('same');
const b = encrypt('same');
assert.ok(!a.equals(b));
assert.equal(decrypt(a), 'same');

// tamper in the ciphertext body is rejected by the GCM tag
const t = encrypt('tamper me');
t[t.length - 1] ^= 0x01;
assert.throws(() => decrypt(t));

// wrong key cannot decrypt
const good = encrypt('secret');
process.env.TOKEN_ENC_KEY = randomBytes(32).toString('base64');
assert.throws(() => decrypt(good));

// a bad key length is a config error, not a silent pass
process.env.TOKEN_ENC_KEY = Buffer.from('too short').toString('base64');
assert.equal(isCryptoConfigured(), false);
assert.throws(() => encrypt('x'));

console.log('crypto.check: ok');
