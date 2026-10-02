/**
 * Self-check for placing at the user's own time. No test runner:
 *   node src/server/ai/place-at.check.mjs
 */
import assert from 'node:assert/strict';

import { ambiguousTime, checkPlaceAt, clashNote, freeNear, overlapping } from './place-at.ts';

// am/pm: ask only when the hour could be either
assert.deepEqual(ambiguousTime('gym at 6'), { said: 'at 6', am: '06:00', pm: '18:00' });
assert.deepEqual(ambiguousTime('run at 5:30'), { said: 'at 5:30', am: '05:30', pm: '17:30' });
assert.deepEqual(ambiguousTime('i am going to gym at 6'), { said: 'at 6', am: '06:00', pm: '18:00' });
assert.equal(ambiguousTime('gym at 6 to 8pm'), null);
assert.deepEqual(ambiguousTime('gym 6-8'), { said: '6-8', am: '06:00', pm: '18:00' });
for (const clear of [
  'i am planning to do gym 6-8pm',
  'gym today at 6pm for 2 hours',
  'gym 18:00-20:00',
  'run at 5:30 in the morning',
  'dinner at 7',
  'gym tomorrow evening at 6',
  'gym for 2-3 hours',
  'call at 11',
  'gym today',
]) {
  assert.equal(ambiguousTime(clear), null, clear);
}

const now = '2026-10-01T12:00:00.000Z';
const horizon = '2026-10-22T12:00:00.000Z';

// the offset the model attaches is dropped: 18:00 is 18:00 on the user's calendar
assert.deepEqual(checkPlaceAt('2026-10-01T18:00:00+02:00', '2026-10-01T20:00:00Z', now, horizon), {
  ok: true,
  span: { startISO: '2026-10-01T18:00:00.000Z', endISO: '2026-10-01T20:00:00.000Z' },
});
for (const [s, e] of [
  ['2026-10-01T20:00:00Z', '2026-10-01T18:00:00Z'], // backwards
  ['2026-10-01T09:00:00Z', '2026-10-01T10:00:00Z'], // already past
  ['2026-11-30T09:00:00Z', '2026-11-30T10:00:00Z'], // beyond the horizon
  ['2026-10-02T06:00:00Z', '2026-10-02T20:00:00Z'], // 14 hours
  ['tomorrow', '2026-10-02T20:00:00Z'], // not a time
]) {
  assert.equal(checkPlaceAt(s, e, now, horizon).ok, false, `${s} → ${e}`);
}

// clashes are named on the card; touching edges are not a clash
const busy = [
  { start: '2026-10-01T18:30:00.000Z', end: '2026-10-01T19:00:00.000Z', title: 'Call with Alice' },
  { start: '2026-10-01T20:00:00.000Z', end: '2026-10-01T21:00:00.000Z', title: 'Dinner' },
];
const span = { startISO: '2026-10-01T18:00:00.000Z', endISO: '2026-10-01T20:00:00.000Z' };
assert.equal(clashNote(busy, span), "it's the time you asked for, but it overlaps Call with Alice (18:30–19:00)");
assert.equal(clashNote(busy.slice(1), span), null);

// "Gym at 12 today" over Lunch 12–13 (free in Google) and a flexible 11:30–14:30
// block: both are named, and the nearest free half hours are 14:30 and 11:00.
{
  const shown = [
    { start: '2026-10-02T11:30:00.000Z', end: '2026-10-02T14:30:00.000Z', title: 'Some block' },
    { start: '2026-10-02T12:00:00.000Z', end: '2026-10-02T13:00:00.000Z', title: 'Lunch' },
  ];
  const gym = { startISO: '2026-10-02T12:00:00.000Z', endISO: '2026-10-02T12:30:00.000Z' };
  assert.deepEqual(overlapping(shown, gym).map((b) => b.title), ['Some block', 'Lunch']);
  assert.deepEqual(freeNear(shown, gym, '2026-10-02T09:22:00.000Z', 7, 22), ['14:30', '11:00']);
  // Never offers a time already past: at 11:10, 11:00 is gone.
  assert.deepEqual(freeNear(shown, gym, '2026-10-02T11:10:00.000Z', 7, 22), ['14:30']);
  // Touching the edge of an event is not overlapping it.
  assert.equal(overlapping(shown, { startISO: '2026-10-02T14:30:00.000Z', endISO: '2026-10-02T15:00:00.000Z' }).length, 0);
}

console.log('place-at: ok');
