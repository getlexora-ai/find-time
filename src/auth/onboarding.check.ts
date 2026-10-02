/**
 * Runnable check for src/auth/onboarding.ts —
 * `npx tsx src/auth/onboarding.check.ts` → `onboarding.check: ok`.
 */
import {
  answersFromProfile,
  checkAnswers,
  checkGroups,
  defaultAnswers,
  energyCurveFor,
  peakFromCurve,
  previewWeek,
  workHoursOf,
} from './onboarding';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`onboarding.check: ${msg}`);
}

const base = defaultAnswers({ timezone: 'Europe/Berlin', clock24: true });

// validation
assert(checkAnswers(base).ok, 'defaults are valid');
assert(!checkAnswers({ ...base, days: [] }).ok, 'no days rejected');
assert(!checkAnswers({ ...base, start: 9, end: 10 }).ok, 'span < 2h rejected');
assert(!checkAnswers({ ...base, timezone: 'Mars/Olympus' }).ok, 'bad zone rejected');
assert(!checkAnswers({ ...base, focusH: 9 }).ok, 'focus > max rejected');
assert(!checkAnswers({ ...base, peak: 'noon' as never }).ok, 'bad peak rejected');
const c = checkAnswers({ ...base, days: ['fri', 'mon', 'xyz'] as never, firstName: '  Ada  ' });
assert(c.ok && c.value.days.join() === 'mon,fri' && c.value.firstName === 'Ada', 'days ordered + cleaned, name trimmed');

// stored shapes
const wh = workHoursOf(base);
assert(wh.mon?.start === 9 && wh.sat === null && Object.keys(wh).length === 7, 'work hours cover every day');
const curve = energyCurveFor('afternoon');
assert(curve.length === 16 && curve.every((p) => p.level >= 0.2 && p.level <= 1), 'curve 6–21 within bounds');
assert(curve.find((p) => p.hour === 15)!.level === 1 && curve.find((p) => p.hour === 9)!.level < 0.5, 'afternoon peaks in the afternoon');

// preview
const focusOf = (a: typeof base) => previewWeek(a).filter((b) => b.kind === 'focus');
const minutes = (bs: { s: number; e: number }[]) => bs.reduce((n, b) => n + b.e - b.s, 0);
const spread = focusOf(base);
assert(minutes(spread) === 5 * 3 * 60, 'spread fills 3h × 5 days');
const meetings = previewWeek(base).filter((b) => b.kind === 'meeting');
assert(
  spread.every((f) => meetings.every((m) => m.day !== f.day || f.e <= m.s || f.s >= m.e)),
  'focus never overlaps a meeting',
);
assert(spread.every((f) => f.s >= base.start * 60 && f.e <= base.end * 60), 'focus inside working hours');
const cluster = focusOf({ ...base, hardWork: 'cluster' });
assert(new Set(cluster.map((b) => b.day)).size < new Set(spread.map((b) => b.day)).size, 'cluster uses fewer days');
const mid = (a: typeof base) => {
  const f = focusOf(a);
  return f.reduce((n, b) => n + (b.s + b.e) / 2, 0) / f.length;
};
const mMorning = mid(base);
const mAfternoon = mid({ ...base, peak: 'afternoon' });
const mEvening = mid({ ...base, peak: 'evening', end: 21 });
assert(mMorning < mAfternoon && mAfternoon < mEvening, 'blocks follow the peak');
assert(focusOf(base).every((b) => b.e - b.s >= 60), 'no sub-hour slivers at 3 h a day');
assert(focusOf({ ...base, days: ['sat'] }).every((b) => b.day === 5), 'only working days get blocks');

// real meetings replace the example ones
const mine = [{ id: 'r', day: 0, s: 9 * 60, e: 13 * 60, title: 'Offsite', kind: 'meeting' as const }];
const withMine = previewWeek(base, mine);
assert(withMine.filter((b) => b.kind === 'meeting').length === 1, 'only the given meetings are shown');
assert(withMine.filter((b) => b.kind === 'focus' && b.day === 0).every((b) => b.s >= 13 * 60), 'focus avoids a real meeting');

// returning users: stored settings → answers, changed groups
for (const p of ['morning', 'midday', 'afternoon', 'evening'] as const) {
  const curve = Object.fromEntries(energyCurveFor(p).map((e) => [e.hour, e.level]));
  assert(peakFromCurve(curve) === p, `curve round-trips for ${p}`);
}
const back = answersFromProfile({
  firstName: 'Ada',
  timezone: 'Asia/Tokyo',
  clock24: false,
  weekStart: 0,
  workHours: { mon: { start: 8, end: 16 }, tue: { start: 8, end: 16 }, wed: { start: 10, end: 14 }, thu: null },
  energyCurve: {},
  maxDailyFocusMin: 150,
  hardWork: 'cluster',
});
assert(back.days.join() === 'mon,tue,wed' && back.start === 8 && back.end === 16, 'most common span wins');
assert(back.focusH === 2.5 && back.hardWork === 'cluster' && back.timezone === 'Asia/Tokyo', 'stored values carried');
assert(back.peak === 'morning', 'the default curve reads as morning');
assert(checkGroups(undefined).length === 6 && checkGroups(['peak', 'nope']).join() === 'peak', 'groups validated');

console.log('onboarding.check: ok');
