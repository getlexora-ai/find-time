/**
 * Self-check for src/server/rate-limit-core.ts. No test runner:
 *   node src/server/rate-limit-core.check.mjs
 */
import assert from 'node:assert/strict';

const { decide, windowStart, secondsToWindowEnd } = await import('./rate-limit-core.ts');

const now = new Date('2026-09-09T14:37:12.500Z');

// windowStart floors to the hour / day in UTC
assert.equal(windowStart('hour', now).toISOString(), '2026-09-09T14:00:00.000Z');
assert.equal(windowStart('day', now).toISOString(), '2026-09-09T00:00:00.000Z');

// secondsToWindowEnd: 22m48s left in the hour, and that + 9h to end of day
assert.equal(secondsToWindowEnd('hour', now), 22 * 60 + 48);
assert.equal(secondsToWindowEnd('day', now), (9 * 60 + 22) * 60 + 48);
assert.ok(secondsToWindowEnd('hour', now) >= 1);

const limits = { hour: 5, day: 20 };
// exactly `limit` calls pass; the (limit+1)th is the first blocked
assert.equal(decide({ hour: 5, day: 5 }, limits, now).ok, true);
assert.equal(decide({ hour: 6, day: 6 }, limits, now).ok, false);
// day cap trips even when the hour is fine
const d = decide({ hour: 1, day: 21 }, limits, now);
assert.equal(d.ok, false);
assert.ok(!d.ok && d.retryAfter > 0);

console.log('rate-limit-core.check: ok');
