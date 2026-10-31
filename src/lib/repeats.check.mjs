/**
 * Self-check for the shared repeat reader (src/lib/repeats.ts) — what the grid
 * draws and what the planner and Plan with AI compute. No test runner:
 *   node src/lib/repeats.check.mjs
 * (The grid's own cases, through layout.ts, are in src/calendar/layout.check.mjs.)
 */
import assert from 'node:assert/strict';

import { datesBetween, daysLabel, describeRule, firstOnOrAfter, formatRule, parseRule, repeatsOn } from './repeats.ts';

// ── reading and writing rules ──
const german = 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH;UNTIL=20261029T235959';
assert.deepEqual(parseRule(german), { freq: 'WEEKLY', interval: 1, byDay: [0, 1, 2, 3], until: '2026-10-29', count: null });
assert.equal(formatRule(parseRule(german)), german, 'round trip');
assert.equal(formatRule({ freq: 'WEEKLY', interval: 2, byDay: [4], until: null, count: 6 }), 'FREQ=WEEKLY;INTERVAL=2;BYDAY=FR;COUNT=6');
assert.equal(formatRule({ freq: 'MONTHLY', interval: 1, byDay: [], until: null, count: null }), 'FREQ=MONTHLY');
assert.equal(parseRule('RRULE:FREQ=DAILY;INTERVAL=3').interval, 3);
// Refused, not half-read: yearly, "first Monday", BYDAY on a monthly rule, garbage.
assert.equal(parseRule('FREQ=YEARLY'), null);
assert.equal(parseRule('FREQ=WEEKLY;BYDAY=1MO'), null);
assert.equal(parseRule('FREQ=MONTHLY;BYDAY=MO'), null);
assert.equal(parseRule('FREQ=WEEKLY;BYDAY=XX'), null);
assert.equal(parseRule(''), null);
assert.equal(parseRule(null), null);

// ── which days ──
// German class: Mon–Thu, 5–29 Oct 2026 → 16 dates, no Fridays.
let d = datesBetween('2026-10-05', german, '2026-10-01', '2026-11-30');
assert.equal(d.length, 16);
assert.deepEqual([d[0], d[3], d[4], d[15]], ['2026-10-05', '2026-10-08', '2026-10-12', '2026-10-29']);
assert.ok(!d.includes('2026-10-09'));
// Every other Friday.
d = datesBetween('2026-10-02', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=FR', '2026-10-01', '2026-11-15');
assert.deepEqual(d, ['2026-10-02', '2026-10-16', '2026-10-30', '2026-11-13']);
// Monthly on the 5th, 3 times.
d = datesBetween('2026-10-05', 'FREQ=MONTHLY;COUNT=3', '2026-10-01', '2027-06-30');
assert.deepEqual(d, ['2026-10-05', '2026-11-05', '2026-12-05']);
// Daily, every 2 days, until the 9th.
d = datesBetween('2026-10-01', 'FREQ=DAILY;INTERVAL=2;UNTIL=20261009T235959', '2026-10-01', '2026-10-31');
assert.deepEqual(d, ['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-07', '2026-10-09']);
// No rule, or one it can't read: the first date only.
assert.equal(repeatsOn('2026-10-05', null, '2026-10-05'), true);
assert.equal(repeatsOn('2026-10-05', 'FREQ=YEARLY', '2026-10-12'), false);
assert.equal(repeatsOn('2026-10-05', german, '2026-10-04'), false, 'never before the first date');
// Plain FREQ=WEEKLY (what the calendar writes for a routine): the first date's weekday.
assert.equal(repeatsOn('2026-10-05', 'FREQ=WEEKLY', '2026-10-19'), true);
assert.equal(repeatsOn('2026-10-05', 'FREQ=WEEKLY', '2026-10-20'), false);
// Open-ended series stop at the limit.
assert.equal(datesBetween('2026-10-05', 'FREQ=DAILY', '2026-10-05', '2030-01-01', 50).length, 50);

// "From Sunday, Mon–Thu" starts on Monday.
assert.equal(firstOnOrAfter('2026-10-04', parseRule(german)), '2026-10-05');
assert.equal(firstOnOrAfter('2026-10-07', parseRule(german)), '2026-10-07');

// ── words ──
assert.equal(daysLabel([0, 1, 2, 3]), 'Mon–Thu');
assert.equal(daysLabel([0, 2, 4]), 'Mon, Wed, Fri');
assert.equal(daysLabel([0, 1, 2, 3, 4]), 'weekdays');
assert.equal(daysLabel([4, 5, 6]), 'Fri–Sun');
assert.equal(describeRule('2026-10-05', german), 'Mon–Thu · until Thu 29 Oct');
assert.equal(describeRule('2026-10-02', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=FR'), 'every 2 weeks on Fri · no end');
assert.equal(describeRule('2026-10-05', 'FREQ=MONTHLY;COUNT=6'), 'monthly on the 5th · 6 times');
assert.equal(describeRule('2026-10-01', 'FREQ=DAILY'), 'daily · no end');

console.log('repeats.check: ok');
