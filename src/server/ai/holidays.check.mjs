/**
 * Self-check for public holidays as days off (src/server/ai/holidays.ts) and
 * how the planners read them: plan-input.ts, clarify.ts whenOptions,
 * tools/look.ts. No test runner:
 *   node src/server/ai/holidays.check.mjs
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../', import.meta.url));
register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('@/')) spec = ${JSON.stringify(SRC)} + spec.slice(2) + (/\\.[a-z]+$/i.test(spec) ? '' : '.ts');
  else if (spec.startsWith('.') && !/\\.[a-z]+$/i.test(spec)) spec = spec + '.ts';
  return next(spec, ctx);
}`),
);

const H = await import('./holidays.ts');
const { planInputFor } = await import('./plan-input.ts');
const { planWeek, verifyPlan } = await import('./plan-week.ts');
const { whenOptions } = await import('./clarify.ts');
const { freeTime, findEvents } = await import('./tools/look.ts');
const { defaultProfile } = await import('./preferences.ts');

const profile = defaultProfile();
// Thu 24 Dec 2026, 08:00. Fri 25 Dec is Christmas; Sat 26 Dec is a holiday on a weekend.
const NOW = '2026-12-24T08:00:00.000Z';
const calendars = [
  { id: 'cal_main', name: 'Work', holiday: false },
  { id: 'cal_hol', name: 'Holidays in Germany', holiday: true },
];
const ev = (id, start, end, over = {}) => ({
  id, title: id, start, end, category: 'other', itemType: 'event', flexibility: 'fixed', origin: 'imported',
  isDraft: false, rrule: null, projectLabel: null, notes: null, calendarId: 'cal_main', allDay: false, free: false, ...over,
});
const nextDay = (date) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString();
const allDay = (id, date, over) => ev(id, `${date}T00:00:00.000Z`, nextDay(date), { allDay: true, free: true, ...over });

// ── which calendars are holiday ones ────────────────────────────────────────
assert.equal(H.isHolidayCalendar('en.german#holiday@group.v.calendar.google.com'), true);
assert.equal(H.isHolidayCalendar('de.german#holiday@group.v.calendar.google.com'), true);
assert.equal(H.isHolidayCalendar('primary'), false);
assert.equal(H.isHolidayCalendar('en.german#contacts@group.v.calendar.google.com'), false);

// ── events carry their calendar, holidays marked ────────────────────────────
const raw = [
  allDay('xmas', '2026-12-25', { calendarId: 'cal_hol', title: 'Christmas Day' }),
  allDay('boxing', '2026-12-26', { calendarId: 'cal_hol', title: 'Busy' }), // live title unreadable
  allDay('bday', '2026-12-28', { title: 'Mum birthday' }), // all-day, free, not a holiday
  ev('meet', '2026-12-24T10:00:00.000Z', '2026-12-24T11:00:00.000Z'),
];
const events = H.onCalendars(raw, calendars);
assert.equal(events.find((e) => e.id === 'xmas').holiday, true);
assert.equal(events.find((e) => e.id === 'xmas').calendarName, 'Holidays in Germany');
assert.equal(events.find((e) => e.id === 'bday').holiday, undefined);
assert.equal(events.find((e) => e.id === 'meet').calendarName, 'Work');
assert.deepEqual(H.onCalendars(raw, []), raw, 'no calendars read: events as they were');

assert.deepEqual(H.holidaysIn(events), [
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2026-12-26', name: null },
]);
// A holiday over several days is each of them.
assert.deepEqual(
  H.holidaysIn([{ start: '2026-04-03T00:00:00.000Z', end: '2026-04-05T00:00:00.000Z', holiday: true, title: 'Easter' }]).map((h) => h.date),
  ['2026-04-03', '2026-04-04'],
);

// ── the words ───────────────────────────────────────────────────────────────
const xmas = { date: '2026-12-25', name: 'Christmas Day' };
assert.equal(H.plannedAroundNote([xmas]), 'Fri 25 Dec (Christmas Day) is a public holiday, so no new work was planned on it.');
assert.equal(H.plannedAroundNote([{ date: '2026-12-25', name: null }]), 'Fri 25 Dec is a public holiday, so no new work was planned on it.');
assert.equal(
  H.plannedAroundNote([xmas, { date: '2027-01-01', name: null }], 'search'),
  'Fri 25 Dec (Christmas Day) and Fri 1 Jan are public holidays, so I kept work off them.',
);
assert.equal(H.plannedAroundNote([]), '');
// An explicit time on the holiday is kept, and the reply says what day it is.
assert.deepEqual(H.holidayOn([xmas], '2026-12-25T10:00:00.000Z'), xmas);
assert.equal(H.holidayOn([xmas], '2026-12-24T10:00:00.000Z'), null);
assert.equal(H.namedDayNote(xmas), 'Fri 25 Dec is a public holiday (Christmas Day) — I kept the time you asked for.');
// "2h of deep work on 25 Dec": the window is only the holiday, so it is searched.
assert.equal(H.onlyHolidays([xmas], '2026-12-25T00:00:00.000Z', '2026-12-26T00:00:00.000Z'), true);
assert.equal(H.onlyHolidays([xmas], '2026-12-24T08:00:00.000Z', '2026-12-26T00:00:00.000Z'), false);
assert.deepEqual(H.holidaysBetween([xmas], '2026-12-24T08:00:00.000Z', '2026-12-25T00:00:00.000Z'), []);
assert.deepEqual(H.holidaysBetween([xmas], '2026-12-24T08:00:00.000Z', '2026-12-25T00:00:01.000Z'), [xmas]);

// ── plan my week, from the events as loaded ─────────────────────────────────
{
  const tasks = [{ id: 't1', title: 'Report', durationMin: 120, dueBy: '2026-12-26T00:00:00.000Z', preferBy: null, notBefore: '2026-12-25T00:00:00.000Z', priority: 'medium', effort: 'normal', preferredWindow: null, splittable: false, minChunkMin: 30, category: 'deep-work' }];
  // Christmas marked busy in Google: still a day off, not time away.
  const busyXmas = events.map((e) => (e.id === 'xmas' ? { ...e, free: false } : e));
  const { input } = planInputFor(busyXmas, tasks, [], profile, NOW);
  assert.deepEqual(input.holidays.map((h) => h.date), ['2026-12-25', '2026-12-26']);
  assert.deepEqual(input.away, []);
  assert.ok(!input.busy.some((b) => b.start.startsWith('2026-12-25')), 'a holiday is not busy time');
  // The birthday (all-day, free, not a holiday) still doesn't block.
  assert.ok(!input.busy.some((b) => b.start.startsWith('2026-12-28')));
  const plan = planWeek(input);
  assert.deepEqual(verifyPlan(input, plan), []);
  assert.equal(plan.blocks.filter((b) => b.status === 'new' && b.startISO.startsWith('2026-12-25')).length, 0);
  assert.equal(plan.unplaced.length, 1, 'only the holiday was left before the deadline');
  // Only Christmas is listed: Boxing Day is a Saturday.
  assert.deepEqual(plan.holidays, [xmas]);

  // A non-holiday all-day free event changes nothing about the plan.
  const open = [{ ...tasks[0], notBefore: '2026-12-28T00:00:00.000Z', dueBy: '2026-12-29T00:00:00.000Z' }];
  const p2 = planWeek(planInputFor(events, open, [], profile, NOW).input);
  assert.equal(p2.blocks.filter((b) => b.startISO.startsWith('2026-12-28')).length, 1);
}

// ── asking which day: no work offered on the holiday ────────────────────────
{
  const opts = { busy: [], profile, durationMin: 60, nowMs: Date.parse(NOW), horizonMs: Date.parse('2027-01-14T00:00:00.000Z') };
  assert.ok(whenOptions({ ...opts, category: 'deep-work' }).includes('Tomorrow'));
  assert.ok(!whenOptions({ ...opts, category: 'deep-work', holidays: [xmas] }).includes('Tomorrow'));
  // Personal time is fine on a holiday.
  assert.ok(whenOptions({ ...opts, category: 'personal', holidays: [xmas] }).includes('Tomorrow'));
}

// ── what the model reads ────────────────────────────────────────────────────
{
  const [day] = freeTime(events, profile, NOW, '2026-12-25');
  assert.equal(day.working_day, false);
  assert.equal(day.public_holiday, 'Christmas Day');
  const [thu] = freeTime(events, profile, NOW, '2026-12-24');
  assert.equal(thu.working_day, true);
  assert.equal(thu.public_holiday, undefined);
  const found = findEvents(events, '', '2026-12-24', 7);
  assert.equal(found.find((f) => f.id === 'xmas').calendar, 'Holidays in Germany');
  assert.equal(found.find((f) => f.id === 'xmas').public_holiday, true);
  assert.equal(found.find((f) => f.id === 'meet').calendar, 'Work');
}

console.log('holidays.check: ok');
