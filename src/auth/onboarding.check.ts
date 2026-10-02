/**
 * Runnable check for src/auth/onboarding.ts —
 * `npx tsx src/auth/onboarding.check.ts` → `onboarding.check: ok`.
 */
import { checkAnswers, defaultAnswers, energyCurveFor, previewWeek, workHoursOf } from './onboarding';

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
const morning = focusOf(base)[0];
const evening = focusOf({ ...base, peak: 'evening', end: 21 }).filter((b) => b.day === 0)[0];
assert(morning.s < 12 * 60 && evening.s >= 17 * 60, 'blocks follow the peak');
assert(focusOf({ ...base, days: ['sat'] }).every((b) => b.day === 5), 'only working days get blocks');

console.log('onboarding.check: ok');
