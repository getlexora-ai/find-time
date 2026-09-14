/**
 * Self-check for time-off parsing and day splitting. No test runner:
 *   node src/server/ai/time-off.check.mjs
 */
import assert from 'node:assert/strict';

import { checkTimeOff, splitByDay } from './time-off.ts';

const now = '2026-09-14T20:42:00.000Z';

// the message that started this: 17th from 6pm till 22nd 6pm
const trip = checkTimeOff('2026-09-17T18:00:00Z', '2026-09-22T18:00:00Z', now);
assert.equal(trip.ok, true);
const days = splitByDay(trip.span);
assert.equal(days.length, 6);
assert.deepEqual(days[0], { startISO: '2026-09-17T18:00:00.000Z', endISO: '2026-09-17T23:59:00.000Z' });
assert.deepEqual(days[1], { startISO: '2026-09-18T00:00:00.000Z', endISO: '2026-09-18T23:59:00.000Z' });
assert.deepEqual(days[5], { startISO: '2026-09-22T00:00:00.000Z', endISO: '2026-09-22T18:00:00.000Z' });

// an offset is ignored: the time is what the user said, not a conversion of it
const offset = checkTimeOff('2026-09-17T18:00:00+02:00', '2026-09-17T22:00:00-05:00', now);
assert.equal(offset.ok && offset.span.startISO, '2026-09-17T18:00:00.000Z');
assert.equal(offset.ok && offset.span.endISO, '2026-09-17T22:00:00.000Z');

// bare dates are whole days, the last one included
const bare = checkTimeOff('2026-09-17', '2026-09-18', now);
assert.equal(bare.ok, true);
assert.deepEqual(splitByDay(bare.span).map((d) => d.startISO.slice(0, 10)), ['2026-09-17', '2026-09-18']);

// ending at midnight does not add an empty day
assert.equal(splitByDay({ startISO: '2026-09-17T09:00:00.000Z', endISO: '2026-09-18T00:00:00.000Z' }).length, 1);

// already under way: blocked from the start of today, not from the past
const ongoing = checkTimeOff('2026-09-10T00:00:00Z', '2026-09-16T00:00:00Z', now);
assert.equal(ongoing.ok && ongoing.span.startISO, '2026-09-14T00:00:00.000Z');

// refusals come back as something to say, never as a guess
assert.equal(checkTimeOff('2026-09-22T18:00:00Z', '2026-09-17T18:00:00Z', now).ok, false);
assert.equal(checkTimeOff('2026-09-01', '2026-09-05', now).ok, false);
assert.equal(checkTimeOff('2026-10-01', '2026-12-31', now).ok, false);
assert.equal(checkTimeOff('2028-01-01', '2028-01-02', now).ok, false);
assert.equal(checkTimeOff('next week', '2026-09-22', now).ok, false);
assert.equal(checkTimeOff(undefined, '2026-09-22', now).ok, false);

console.log('time-off.check: ok');
