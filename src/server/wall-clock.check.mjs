/**
 * Self-check for src/server/wall-clock.ts. No test runner:
 *   node src/server/wall-clock.check.mjs
 */
import assert from 'node:assert/strict';

const { wallClockAt, wallClockNow } = await import('./wall-clock.ts');

// The bug: 09:30 in Berlin is 07:30 real UTC. Read as wall-clock that was
// "07:30", so a 09:00 slot looked two hours away and was offered.
const real = Date.parse('2026-10-02T07:30:00.000Z');
const now = wallClockNow('Europe/Berlin', real);
assert.equal(new Date(now).toISOString(), '2026-10-02T09:30:00.000Z');
assert.ok(Date.parse('2026-10-02T09:00:00.000Z') < now, '09:00 is in the past at 09:30');

// Winter time is +1, and the change happens on the right night (Sun 25 Oct 2026).
assert.equal(wallClockAt(Date.parse('2026-12-01T12:00:00.000Z'), 'Europe/Berlin'), '2026-12-01T13:00:00.000Z');
assert.equal(wallClockAt(Date.parse('2026-10-25T00:30:00.000Z'), 'Europe/Berlin'), '2026-10-25T02:30:00.000Z');
assert.equal(wallClockAt(Date.parse('2026-10-25T01:30:00.000Z'), 'Europe/Berlin'), '2026-10-25T02:30:00.000Z');

// Other zones, and a date change: 23:30 real UTC is already tomorrow in Berlin.
assert.equal(wallClockAt(Date.parse('2026-10-02T23:30:00.000Z'), 'Europe/Berlin'), '2026-10-03T01:30:00.000Z');
assert.equal(wallClockAt(Date.parse('2026-10-02T12:00:00.000Z'), 'America/New_York'), '2026-10-02T08:00:00.000Z');
assert.equal(wallClockAt(Date.parse('2026-10-02T12:00:00.000Z'), 'UTC'), '2026-10-02T12:00:00.000Z');

// An unknown zone falls back to Berlin rather than to real UTC.
assert.equal(wallClockAt(real, 'Mars/Olympus'), null);
assert.equal(wallClockNow('Mars/Olympus', real), now);
assert.equal(wallClockNow(null, real), now);

console.log('wall-clock.check: ok');
