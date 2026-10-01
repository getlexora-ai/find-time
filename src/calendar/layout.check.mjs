/**
 * Self-check for the grid's geometry (src/calendar/layout.ts): repeats, one
 * day's slice of an event, clipping to your hours, overlap columns. No test
 * runner:
 *   node --experimental-strip-types src/calendar/layout.check.mjs
 *
 * layout.ts imports its siblings without an extension and tokens.ts imports
 * react-native, so a tiny loader resolves `./x` to `./x.ts` and stands in for
 * react-native with the one thing tokens.ts uses at load (Platform.select).
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === 'react-native')
    return { shortCircuit: true, url: 'data:text/javascript,export const Platform = { select: (o) => o.default };' };
  if (spec.startsWith('.') && !/\\.[a-z]+$/i.test(spec)) return next(spec + '.ts', ctx);
  return next(spec, ctx);
}`),
);

const { repeatsOn, sliceOn, placeIn, laidOut, planDay, allDayOn } = await import('./layout.ts');

const ev = (o) => ({ id: 1, date: '2026-09-28', start: '09:00', end: '10:00', title: 't', cat: 'admin', project: '', kind: 'event', notes: '', ...o });

/* ── repeatsOn ── (2026-09-28 is a Monday) */
{
  const once = { date: '2026-09-28' };
  assert.equal(repeatsOn(once, '2026-09-28'), true);
  assert.equal(repeatsOn(once, '2026-09-29'), false);

  const daily = { date: '2026-09-28', rrule: 'FREQ=DAILY' };
  assert.equal(repeatsOn(daily, '2026-09-27'), false, 'never before its first date');
  assert.equal(repeatsOn(daily, '2026-12-31'), true);
  assert.equal(repeatsOn({ ...daily, rrule: 'RRULE:FREQ=DAILY;INTERVAL=2' }, '2026-09-29'), false, 'RRULE: prefix, interval');
  assert.equal(repeatsOn({ ...daily, rrule: 'FREQ=DAILY;INTERVAL=2' }, '2026-09-30'), true);

  const mwf = { date: '2026-09-28', rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' };
  assert.equal(repeatsOn(mwf, '2026-09-30'), true);
  assert.equal(repeatsOn(mwf, '2026-09-29'), false);
  assert.equal(repeatsOn(mwf, '2026-10-05'), true);
  // across the end of daylight saving (Europe: 25 Oct 2026) the week index must not slip
  assert.equal(repeatsOn(mwf, '2026-10-26'), true);
  assert.equal(repeatsOn(mwf, '2026-10-27'), false);

  const weekly = { date: '2026-09-30', rrule: 'FREQ=WEEKLY' };
  assert.equal(repeatsOn(weekly, '2026-10-07'), true, 'no BYDAY: the first date\'s weekday');
  assert.equal(repeatsOn(weekly, '2026-10-06'), false);
  const fortnight = { date: '2026-09-28', rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO' };
  assert.equal(repeatsOn(fortnight, '2026-10-05'), false);
  assert.equal(repeatsOn(fortnight, '2026-10-12'), true);

  assert.equal(repeatsOn({ date: '2026-09-28', rrule: 'FREQ=DAILY;UNTIL=20261007T000000Z' }, '2026-10-07'), true, 'UNTIL is inclusive');
  assert.equal(repeatsOn({ date: '2026-09-28', rrule: 'FREQ=DAILY;UNTIL=20261007T000000Z' }, '2026-10-08'), false);

  const three = { date: '2026-09-28', rrule: 'FREQ=DAILY;COUNT=3' };
  assert.equal(repeatsOn(three, '2026-09-30'), true, 'third of three');
  assert.equal(repeatsOn(three, '2026-10-01'), false, 'fourth is past COUNT');
  const mw3 = { date: '2026-09-28', rrule: 'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=3' };
  assert.equal(repeatsOn(mw3, '2026-10-05'), true);
  assert.equal(repeatsOn(mw3, '2026-10-07'), false);

  const monthly = { date: '2026-01-31', rrule: 'FREQ=MONTHLY' };
  assert.equal(repeatsOn(monthly, '2026-02-28'), false, 'no 31st in February: skipped, not moved');
  assert.equal(repeatsOn(monthly, '2026-03-31'), true);

  assert.equal(repeatsOn({ date: '2026-09-28', rrule: 'FREQ=YEARLY' }, '2027-09-28'), false, 'unsupported: first date only');
  assert.equal(repeatsOn({ date: '2026-09-28', rrule: 'FREQ=YEARLY' }, '2026-09-28'), true);
}

/* ── sliceOn ── */
{
  // 21:00 → 01:00 next day: drawn on both days, each part marked
  const night = ev({ date: '2026-10-02', start: '21:00', end: '01:00', endDate: '2026-10-03' });
  assert.deepEqual(
    (({ s, t, fromPrev, toNext }) => ({ s, t, fromPrev, toNext }))(sliceOn(night, '2026-10-02')),
    { s: 1260, t: 1440, fromPrev: false, toNext: true },
  );
  assert.deepEqual(
    (({ s, t, fromPrev, toNext }) => ({ s, t, fromPrev, toNext }))(sliceOn(night, '2026-10-03')),
    { s: 0, t: 60, fromPrev: true, toNext: false },
  );
  assert.equal(sliceOn(night, '2026-10-04'), null);
  assert.equal(sliceOn(night, '2026-10-01'), null);

  // ends exactly at midnight: nothing on the next day, and it does not "continue"
  const toMidnight = ev({ start: '22:00', end: '00:00', endDate: '2026-09-29' });
  assert.equal(sliceOn(toMidnight, '2026-09-29'), null);
  assert.equal(sliceOn(toMidnight, '2026-09-28').toNext, false);
  assert.equal(sliceOn(toMidnight, '2026-09-28').t, 1440);

  // three days long: the middle day is whole
  const long = ev({ start: '18:00', end: '08:00', endDate: '2026-09-30' });
  const mid = sliceOn(long, '2026-09-29');
  assert.equal(mid.s, 0);
  assert.equal(mid.t, 1440);
  assert.equal(mid.fromPrev && mid.toNext, true);

  assert.equal(sliceOn(ev({ allDay: true, endDate: '2026-09-30' }), '2026-09-28'), null, 'all-day: the lane, not the hours');

  // a repeat is a same-day block on each day it falls on, dated that day
  const standup = ev({ start: '08:45', end: '09:00', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' });
  assert.equal(sliceOn(standup, '2026-10-01').ev.date, '2026-10-01');
  assert.equal(sliceOn(standup, '2026-10-03'), null, 'Saturday');

  // bad data still draws a readable tile
  const bad = sliceOn(ev({ start: '10:00', end: '09:00' }), '2026-09-28');
  assert.equal(bad.t - bad.s, 15);
}

/* ── placeIn (window 06–22) ── */
{
  const sl = (s, t, extra = {}) => ({ ev: ev(), s, t, fromPrev: false, toNext: false, ...extra });
  assert.equal(placeIn(sl(270, 330), 6, 22).at, 'before', '04:30–05:30');
  assert.equal(placeIn(sl(300, 360), 6, 22).at, 'before', 'ends exactly at 06:00');
  assert.equal(placeIn(sl(1320, 1365), 6, 22).at, 'after', 'starts exactly at 22:00');
  assert.equal(placeIn(sl(1380, 1425), 6, 22).at, 'after', '23:00');
  const flight = placeIn(sl(300, 450), 6, 22);
  assert.deepEqual([flight.at, flight.s, flight.t, flight.cutTop, flight.cutBottom], ['in', 360, 450, true, false]);
  const late = placeIn(sl(1260, 1440, { toNext: true }), 6, 22);
  assert.deepEqual([late.s, late.t, late.cutTop, late.cutBottom], [1260, 1320, false, true]);
  // the morning part of an overnight block is cut at the top even inside the window
  const morning = placeIn(sl(0, 420, { fromPrev: true }), 6, 22);
  assert.deepEqual([morning.s, morning.cutTop], [360, true]);
  // a window that ends at midnight takes the whole evening
  assert.equal(placeIn(sl(1380, 1425), 6, 24).at, 'in');
}

/* ── laidOut ── */
{
  const item = (id, s, t) => ({ slice: { ev: ev({ id }), s, t, fromPrev: false, toNext: false }, s, t, cutTop: false, cutBottom: false });
  const cols = (r) => r.blocks.map((b) => `${b.ev.id}:${b.col}/${b.cols}`).sort();

  assert.deepEqual(cols(laidOut([item(1, 540, 600), item(2, 600, 660)])), ['1:0/1', '2:0/1'], 'touching is not overlapping');
  assert.deepEqual(cols(laidOut([item(1, 540, 600), item(2, 570, 660)])), ['1:0/2', '2:1/2']);
  // a chain is one cluster: 1 and 3 do not overlap, so they share a column
  assert.deepEqual(cols(laidOut([item(1, 540, 600), item(2, 570, 660), item(3, 630, 720)])), ['1:0/2', '2:1/2', '3:0/2']);

  // a column frees up as soon as its tile ends: these four need only three
  assert.equal(laidOut([item(1, 810, 870), item(2, 810, 840), item(3, 825, 870), item(4, 840, 885)], 3).overflow.length, 0);

  // four at once, three columns allowed: two tiles and a "+2" in the last third
  const four = laidOut([item(1, 810, 870), item(2, 810, 840), item(3, 825, 870), item(4, 830, 885)], 3);
  assert.equal(four.blocks.length, 2);
  assert.equal(four.overflow.length, 1);
  assert.deepEqual([four.overflow[0].col, four.overflow[0].cols, four.overflow[0].items.length], [2, 3, 2]);
  assert.equal(four.overflow[0].s, 825, 'the chip starts where the first hidden tile does');
  assert.ok(four.blocks.every((b) => b.cols === 3));

  // a narrow column allows one: one tile beside a "+1"
  const narrow = laidOut([item(1, 540, 600), item(2, 540, 600)], 1);
  assert.equal(narrow.blocks.length, 1);
  assert.equal(narrow.overflow[0].items.length, 1);
  assert.equal(laidOut([]).blocks.length, 0);

  // overnight slices keep their true times only where they really start / end
  const nightItem = { slice: { ev: ev(), s: 1260, t: 1440, fromPrev: false, toNext: true }, s: 1260, t: 1320, cutTop: false, cutBottom: true };
  const [b] = laidOut([nightItem]).blocks;
  assert.deepEqual([b.trueStart, b.trueEnd], [1260, null]);
}

/* ── planDay / allDayOn ── */
{
  const evs = [
    ev({ id: 1, date: '2026-09-30', start: '04:30', end: '05:30' }),
    ev({ id: 2, date: '2026-09-30', start: '09:00', end: '12:00' }),
    ev({ id: 3, date: '2026-09-30', start: '23:00', end: '23:45' }),
    ev({ id: 4, date: '2026-09-30', allDay: true, endDate: '2026-10-02' }),
  ];
  const p = planDay(evs, '2026-09-30', 6, 22);
  assert.deepEqual([p.before.map((e) => e.id), p.blocks.map((b) => b.ev.id), p.after.map((e) => e.id)], [[1], [2], [3]]);
  assert.deepEqual(allDayOn(evs, '2026-10-01').map((e) => e.id), [4]);
  assert.deepEqual(allDayOn(evs, '2026-10-02'), [], 'all-day end date is exclusive');
}

console.log('layout.check: ok');
