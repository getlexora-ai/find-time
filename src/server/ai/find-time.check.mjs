/**
 * Self-check for src/server/ai/find-time.ts. No test runner:
 *   node src/server/ai/find-time.check.mjs
 */
import assert from 'node:assert/strict';

const { findFreeSlots } = await import('./find-time.ts');

const base = {
  earliestISO: '2026-09-09T00:00:00.000Z',
  latestISO: '2026-09-09T23:59:00.000Z',
  dayStartHour: 9,
  dayEndHour: 17,
  bufferMin: 0,
};

// empty calendar → first block at the window start
let s = findFreeSlots([], { ...base, durationMin: 60, count: 1 });
assert.deepEqual(s, [{ startISO: '2026-09-09T09:00:00.000Z', endISO: '2026-09-09T10:00:00.000Z' }]);

// a busy 10:00–11:00 block, want two 60-min slots, no buffer
s = findFreeSlots([{ start: '2026-09-09T10:00:00.000Z', end: '2026-09-09T11:00:00.000Z' }], {
  ...base,
  durationMin: 60,
  count: 2,
});
assert.deepEqual(s.map((x) => x.startISO), [
  '2026-09-09T09:00:00.000Z',
  '2026-09-09T11:00:00.000Z',
]);

// buffer only spaces newly-placed blocks apart; a new block may still abut a
// meeting. First slot 09:00–10:00 (touches the 10:00 meeting, allowed); the
// 10:00–11:00 meeting blocks the rest until 11:00; +15 buffer after 09:00 slot
// is moot here since 10:00–11:00 is busy → second slot is 11:00.
s = findFreeSlots([{ start: '2026-09-09T10:00:00.000Z', end: '2026-09-09T11:00:00.000Z' }], {
  ...base,
  durationMin: 60,
  count: 2,
  bufferMin: 15,
});
assert.deepEqual(s.map((x) => x.startISO), [
  '2026-09-09T09:00:00.000Z',
  '2026-09-09T11:00:00.000Z',
]);

// buffer visibly spaces two placed blocks when nothing else is in the way:
// 30-min blocks with a 15-min gap → 09:00, 09:45, 10:30
s = findFreeSlots([], { ...base, durationMin: 30, count: 3, bufferMin: 15 });
assert.deepEqual(s.map((x) => x.startISO), [
  '2026-09-09T09:00:00.000Z',
  '2026-09-09T09:45:00.000Z',
  '2026-09-09T10:30:00.000Z',
]);

// never overlaps a busy block
const busy = [
  { start: '2026-09-09T09:00:00.000Z', end: '2026-09-09T12:00:00.000Z' },
  { start: '2026-09-09T13:00:00.000Z', end: '2026-09-09T14:00:00.000Z' },
];
s = findFreeSlots(busy, { ...base, durationMin: 30, count: 5 });
for (const slot of s) {
  const ss = Date.parse(slot.startISO);
  const se = Date.parse(slot.endISO);
  for (const b of busy) {
    assert.ok(!(ss < Date.parse(b.end) && se > Date.parse(b.start)), `overlap: ${slot.startISO}`);
  }
}
// 12:00–13:00 and 14:00–17:00 are free → 30-min blocks: 12:00, 12:30, 14:00, 14:30, 15:00
assert.equal(s.length, 5);
assert.equal(s[0].startISO, '2026-09-09T12:00:00.000Z');

// day window is honoured — nothing before 09:00 even with room
s = findFreeSlots([], { ...base, durationMin: 60, count: 1, earliestISO: '2026-09-09T06:00:00.000Z' });
assert.equal(s[0].startISO, '2026-09-09T09:00:00.000Z');

// fully booked window → no slots
s = findFreeSlots([{ start: '2026-09-09T08:00:00.000Z', end: '2026-09-09T18:00:00.000Z' }], {
  ...base,
  durationMin: 60,
  count: 3,
});
assert.deepEqual(s, []);

// multi-day: want 3, today full, spills to tomorrow
s = findFreeSlots([{ start: '2026-09-09T08:00:00.000Z', end: '2026-09-09T18:00:00.000Z' }], {
  ...base,
  latestISO: '2026-09-11T23:59:00.000Z',
  durationMin: 60,
  count: 2,
});
assert.equal(s.length, 2);
assert.equal(s[0].startISO, '2026-09-10T09:00:00.000Z');
assert.equal(s[1].startISO, '2026-09-10T10:00:00.000Z');

console.log('find-time.check: ok');
