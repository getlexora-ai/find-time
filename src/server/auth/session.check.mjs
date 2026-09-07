/**
 * Self-check for src/server/auth/session.ts.
 *   node src/server/auth/session.check.mjs
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

process.env.SESSION_SECRET ??= randomBytes(32).toString('hex');
process.env.TOKEN_ENC_KEY ??= randomBytes(32).toString('base64'); // session.ts imports crypto.ts

const {
  currentUserId,
  isSignedIn,
  sessionSetCookie,
  sessionClearCookie,
  parseCookies,
  DEMO_USER_ID,
  SESSION_COOKIE,
} = await import('./session.ts');

const req = (cookie) =>
  new Request('http://localhost:8081/api/events', cookie ? { headers: { cookie } } : undefined);

// no cookie -> demo user, not signed in
assert.equal(currentUserId(req()), DEMO_USER_ID);
assert.equal(isSignedIn(req()), false);

// a freshly minted cookie round-trips
const setCookie = sessionSetCookie(req(), 'g_12345');
const value = setCookie.slice(setCookie.indexOf('=') + 1, setCookie.indexOf(';'));
assert.equal(currentUserId(req(`${SESSION_COOKIE}=${value}`)), 'g_12345');
assert.equal(isSignedIn(req(`${SESSION_COOKIE}=${value}`)), true);

// localhost dev cookie is not Secure; a remote host is
assert.ok(!sessionSetCookie(req(), 'g_1').includes('Secure'));
assert.ok(
  sessionSetCookie(new Request('https://find-time.app/api/events'), 'g_1').includes('Secure'),
);

// tampered id is rejected (signature no longer matches)
assert.equal(currentUserId(req(`${SESSION_COOKIE}=g_99999.${value.split('.')[1]}`)), DEMO_USER_ID);
// tampered signature is rejected
assert.equal(currentUserId(req(`${SESSION_COOKIE}=g_12345.deadbeef`)), DEMO_USER_ID);
// unsigned value is rejected
assert.equal(currentUserId(req(`${SESSION_COOKIE}=g_12345`)), DEMO_USER_ID);

// a different secret invalidates an old cookie
process.env.SESSION_SECRET = randomBytes(32).toString('hex');
assert.equal(currentUserId(req(`${SESSION_COOKIE}=${value}`)), DEMO_USER_ID);

// clear cookie expires it
assert.ok(sessionClearCookie(req()).includes('Max-Age=0'));

// cookie parser handles multiple pairs + encoded chars
const jar = parseCookies(req('a=1; ft_session=x%20y; b=2'));
assert.equal(jar.a, '1');
assert.equal(jar.ft_session, 'x y');
assert.equal(jar.b, '2');

console.log('session.check: ok');
