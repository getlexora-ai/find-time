/**
 * Self-check for the Insights readings (src/calendar/insights.ts). No test runner:
 *   node --experimental-strip-types src/calendar/insights.check.mjs
 *
 * Same loader as layout.check.mjs, plus stand-ins for what hours.ts imports at
 * load (AsyncStorage, react, the API client) so the real `workFor` is used.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';

const stub = (src) => ({ shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(src) });
register(
  'data:text/javascript,' +
    encodeURIComponent(`
const stub = ${stub.toString()};
export async function resolve(spec, ctx, next) {
  if (spec === 'react-native') return stub('export const Platform = { select: (o) => o.default };');
  if (spec === '@react-native-async-storage/async-storage') return stub('export default {};');
  if (spec === 'react') return stub('export const useSyncExternalStore = () => null;');
  if (spec === '@/lib/api') return stub('export const apiFetch = () => null, hasTokenGetter = () => false, onTokenGetter = () => () => {};');
  if (spec.startsWith('.') && !/\\.[a-z]+$/i.test(spec)) return next(spec + '.ts', ctx);
  return next(spec, ctx);
}`),
);

const { readDay, readInsight, gapsAhead, hm, deltaHm } = await import('./insights.ts');

const H = {
  start: 6,
  end: 22,
  work: [{ start: 9, end: 18 }, { start: 9, end: 18 }, { start: 9, end: 18 }, { start: 9, end: 18 }, { start: 9, end: 18 }, null, null],
};
let id = 1;
const ev = (date, start, end, o = {}) => ({ id: id++, date, start, end, title: 't', cat: 'admin', project: '', kind: 'event', notes: '', ...o });

const MON = '2026-09-28';
const SAT = '2026-10-03';

/* ── a working Monday ── */
{
  const events = [
    ev(MON, '09:00', '11:00', { kind: 'focus', cat: 'deep' }),
    ev(MON, '10:30', '11:30', { cat: 'sync' }), // overlaps focus by 30m
    ev(MON, '11:30', '12:00', { cat: 'sync' }), // back to back with the one before
    ev(MON, '12:00', '12:45', { kind: 'break' }),
    ev(MON, '13:00', '13:20', { cat: 'design' }), // leaves a 15m crumb
    ev(MON, '13:35', '14:00', { cat: 'design' }),
    ev(MON, '19:00', '20:00', { kind: 'task' }), // after hours
    ev(MON, '15:00', '16:00', { kind: 'ai', cat: 'deep' }), // proposal: not booked
  ];
  const d = readDay(events, MON, H, MON);
  assert.equal(d.workMin, 540);
  assert.equal(d.bookedMin, 120 + 30 + 30 + 45 + 20 + 25 + 60, 'overlap merged once, proposal excluded');
  assert.equal(d.inWorkMin, d.bookedMin - 60, 'after-hours task is outside work');
  assert.deepEqual(d.gaps, [{ s: 765, t: 780 }, { s: 800, t: 815 }, { s: 840, t: 1080 }]);
  assert.equal(d.freeMin, 15 + 15 + 240);
  assert.equal(d.readyMin, 240);
  assert.equal(d.readyCount, 1);
  assert.equal(d.crumbMin, 30);
  assert.equal(d.focusMin, 120);
  assert.equal(d.meetings, 2);
  assert.equal(d.meetingMin, 90);
  assert.equal(d.b2bRuns, 1);
  assert.equal(d.b2bLongestMin, 90);
  // deep → sync → sync → design → design → admin(task): break excluded
  assert.equal(d.switches, 3);
  assert.equal(d.outsideMin, 60);
  assert.equal(d.breaks, 1);
  assert.equal(d.first, 540);
  assert.equal(d.last, 1200);
  assert.equal(d.isToday, true);

  // gaps ahead: at 14:30 only the afternoon remains, clipped to now
  assert.deepEqual(gapsAhead(d, 870), [{ s: 870, t: 1080 }]);
  assert.deepEqual(gapsAhead({ ...d, isToday: false, isPast: true }, 870), []);
}

/* ── a day off: no capacity, every work block counts as outside hours ── */
{
  const d = readDay([ev(SAT, '10:00', '12:00', { kind: 'task' }), ev(SAT, '13:00', '14:00', { kind: 'routine', rrule: 'FREQ=DAILY' })], SAT, H, MON);
  assert.equal(d.work, null);
  assert.equal(d.freeMin, 0);
  assert.equal(d.outsideMin, 120, 'routine is not work spill');
  assert.equal(d.bookedMin, 180);
}

/* ── week + comparison: no events last week → prev is null, not zeros ── */
{
  const days = Array.from({ length: 7 }, (_, i) => `2026-09-${String(28 + i).padStart(2, '0')}`).map((s) => (s > '2026-09-30' ? s.replace(/09-(\d+)/, (_, n) => `10-${String(n - 30).padStart(2, '0')}`) : s));
  assert.equal(days[6], '2026-10-04');
  const wk = [ev(MON, '09:00', '10:00'), ev('2026-10-01', '09:00', '13:00', { kind: 'focus', cat: 'deep' })];
  const a = readInsight(wk, days, H, MON);
  assert.equal(a.prev, null);
  assert.equal(a.totals.workDays, 5);
  assert.equal(a.totals.workMin, 5 * 540);
  assert.equal(a.busiest.date, '2026-10-01');

  const b = readInsight([...wk, ev('2026-09-22', '09:00', '11:00')], days, H, MON);
  assert.equal(b.prev.bookedMin, 120);
}

/* ── formatting ── */
assert.equal(hm(0), '0m');
assert.equal(hm(45), '45m');
assert.equal(hm(150), '2h 30m');
assert.equal(deltaHm(180), '+3h');
assert.equal(deltaHm(-45), '−45m');
assert.equal(deltaHm(0), 'same');

console.log('insights.check: ok');
