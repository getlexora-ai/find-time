/**
 * Self-check for src/server/auth/password.ts. No test runner:
 *   node src/server/auth/password.check.mjs
 */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { scryptSync } from 'node:crypto';

const { hashPassword, verifyPassword, passwordPolicyError } = await import('./password.ts');

// policy
assert.equal(passwordPolicyError('short'), 'Password must be at least 8 characters.');
assert.equal(passwordPolicyError(12345678), 'Password must be at least 8 characters.');
assert.equal(passwordPolicyError('x'.repeat(201)), 'Password must be 200 characters or fewer.');
assert.equal(passwordPolicyError('correct horse'), null);

// round-trip, including unicode
for (const pw of ['password123', 'correct horse battery staple', '🔒 пароль ' + 'z'.repeat(50)]) {
  const h = await hashPassword(pw);
  assert.ok(h.startsWith('scrypt$16384$8$1$'), h);
  assert.equal(await verifyPassword(pw, h), true);
  assert.equal(await verifyPassword(pw + 'x', h), false);
}

// two hashes of the same password differ (random salt) but both verify
const a = await hashPassword('same');
const b = await hashPassword('same');
assert.notEqual(a, b);
assert.equal(await verifyPassword('same', a), true);
assert.equal(await verifyPassword('same', b), true);

// garbage stored value is rejected, not thrown
assert.equal(await verifyPassword('x', 'not-a-hash'), false);
assert.equal(await verifyPassword('x', 'scrypt$16384$8$1$$'), false);

// a hash with non-default params still verifies (params travel with the hash)
const salt = Buffer.from('sixteenbytes__ok');
const dk = scryptSync('legacy', salt, 32, { N: 1024, r: 8, p: 1 });
const legacyHash = `scrypt$1024$8$1$${salt.toString('base64')}$${dk.toString('base64')}`;
assert.equal(await verifyPassword('legacy', legacyHash), true);
assert.equal(await verifyPassword('nope', legacyHash), false);

console.log('password.check: ok');
