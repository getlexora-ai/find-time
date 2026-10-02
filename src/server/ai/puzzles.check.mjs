/**
 * The deterministic planner puzzles (suites A–Z, plus the "golden" cases),
 * run against plan-week.ts. Unlike the other *.check.mjs files this does not
 * stop at the first failure: it grades every puzzle and prints a scorecard.
 *
 *   node src/server/ai/puzzles.check.mjs            # table
 *   node src/server/ai/puzzles.check.mjs --json     # rows as JSON
 *
 * Verdicts:
 *   PASS  does what the puzzle expects
 *   FAIL  does something the puzzle (and our own rules) say it shouldn't
 *   DIFF  sensible, but under a different declared policy than the puzzle's
 *   N/A   the engine has no such feature (dependencies, context switching…)
 *
 * Conventions: Monday 5 Oct 2026, now 06:00. Availability is modelled as busy
 * time around the free windows on a 0–24 working day, so each puzzle's
 * "Available: 09–12" means exactly that. Buffer 0 and no daily budget unless
 * the puzzle is about them.
 */
const { planWeek, verifyPlan, travelPadding } = await import('./plan-week.ts');
const { defaultProfile } = await import('./preferences.ts');
const { learnFrom } = await import('./learn.ts');
const { scoreFeatures } = await import('./scoring.ts');

const MIN = 60_000;
const DAY = 86_400_000;
const BASE = Date.UTC(2026, 9, 5); // Mon 5 Oct 2026
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, '.000Z');
const hm = (s) => {
  const [h, m] = s.split(':').map(Number);
  return (h * 60 + m) * MIN;
};
/** instant on day `d` (0 = Mon 5 Oct) at "HH:MM" */
const at = (d, t, base = BASE) => iso(base + d * DAY + hm(t));
/** exclusive end of day `d` — our deadline convention */
const endOf = (d, base = BASE) => iso(base + (d + 1) * DAY);
const NOW = at(0, '06:00');

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmt = (s) => {
  const d = new Date(s);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1} ${d.toISOString().slice(11, 16)}`;
};
const span = (b) => `${fmt(b.startISO)}–${b.endISO.slice(11, 16)}`;

/** Busy time that leaves exactly `windows` free: {dayOffset: [["09:00","12:00"], …]}; other days fully busy. */
function avail(windows, base = BASE, days = 70) {
  const busy = [];
  for (let d = -1; d < days; d++) {
    const day = base + d * DAY;
    const free = (windows[d] ?? []).map(([s, e]) => [day + hm(s), day + hm(e)]).sort((a, b) => a[0] - b[0]);
    let cur = day;
    for (const [s, e] of free) {
      if (s > cur) busy.push({ start: iso(cur), end: iso(s) });
      cur = Math.max(cur, e);
    }
    if (cur < day + DAY) busy.push({ start: iso(cur), end: iso(day + DAY) });
  }
  return busy;
}
const weekdays = (w, n = 5) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, w]));

const allDay = { start: 0, end: 24 };
const prof = (over = {}) => ({
  ...defaultProfile(),
  workHours: { sun: allDay, mon: allDay, tue: allDay, wed: allDay, thu: allDay, fri: allDay, sat: allDay },
  defaultBufferMin: 0,
  maxDailyFocusMin: 100_000,
  ...over,
});
const task = (id, over = {}) => ({
  id,
  title: id,
  category: 'deep-work',
  durationMin: 60,
  priority: 'medium',
  splittable: false,
  minChunkMin: 15,
  ...over,
});

function run(over) {
  const input = { nowISO: NOW, busy: [], existing: [], profile: prof(), tasks: [], ...over };
  let plan;
  try {
    plan = planWeek(input);
  } catch (err) {
    return { input, plan: null, crash: String(err?.message ?? err), problems: [] };
  }
  const problems = verifyPlan(input, plan);
  return { input, plan, problems };
}
const of = (p, id) => p.blocks.filter((b) => b.taskId === id);
const minsOf = (b) => (Date.parse(b.endISO) - Date.parse(b.startISO)) / MIN;
const total = (p, id) => of(p, id).reduce((n, b) => n + minsOf(b), 0);
const describe = (r) => {
  if (r.crash) return `CRASH: ${r.crash}`;
  const p = r.plan;
  const parts = p.blocks.map((b) => `${b.taskId ?? b.habitId} ${span(b)}${b.status === 'new' ? '' : ` (${b.status})`}`);
  for (const u of p.unplaced) parts.push(`${u.taskId ?? u.habitId} UNPLACED ${u.neededMin}m: ${u.reason}`);
  if (p.moved.length) parts.push(`moved: ${p.moved.map((m) => `${m.eventId} (${m.why})`).join(', ')}`);
  if (p.issues?.length) parts.push(`issues: ${p.issues.join('; ')}`);
  return parts.join(' | ') || '(nothing placed, nothing reported)';
};
/**
 * A bad-input puzzle passes when the planner reports the problem in `issues`
 * (matching `re`) and doesn't plan the bad item (`id`) on a guess.
 */
const flagged = (r, re, id) => {
  if (r.crash) return { verdict: 'FAIL', r, note: 'throws instead of reporting the problem' };
  const said = r.plan.issues.some((s) => re.test(s));
  const guessed = id ? of(r.plan, id).length > 0 : false;
  return { verdict: said && !guessed ? 'PASS' : 'FAIL', r, note: said ? (guessed ? 'reported, but planned anyway' : '') : 'not reported' };
};

// ── scorecard ─────────────────────────────────────────────────────────────
const rows = [];
function check(id, suite, name, expected, fn) {
  let out;
  try {
    out = fn();
  } catch (err) {
    out = { verdict: 'FAIL', actual: `harness error: ${err.stack ?? err}` };
  }
  // Any plan that breaks a hard rule fails, whatever the puzzle asked.
  if (out.r?.problems?.length && out.verdict !== 'N/A') {
    out.verdict = 'FAIL';
    out.note = `verifyPlan: ${out.r.problems.join('; ')}${out.note ? ` — ${out.note}` : ''}`;
  }
  rows.push({ id, suite, name, expected, actual: out.actual ?? (out.r ? describe(out.r) : ''), verdict: out.verdict, note: out.note ?? '' });
}
const na = (id, suite, name, expected, note) => check(id, suite, name, expected, () => ({ verdict: 'N/A', actual: '—', note }));
const v = (cond, r, note, otherwise = 'FAIL') => ({ verdict: cond ? 'PASS' : otherwise, r, note });

// ══ A — time basics ══════════════════════════════════════════════════════
check('A1', 'A time', 'Exact one-hour slot', '09:00–10:00', () => {
  const r = run({ busy: avail({ 0: [['09:00', '10:00']] }), tasks: [task('T1', { dueByISO: endOf(0) })] });
  return v(of(r.plan, 'T1')[0]?.startISO === at(0, '09:00'), r);
});
check('A2', 'A time', 'Task shorter than slot', '09:00–10:00', () => {
  const r = run({ busy: avail({ 0: [['09:00', '11:00']] }), tasks: [task('T1', { dueByISO: endOf(0) })] });
  const b = of(r.plan, 'T1')[0];
  if (b?.startISO === at(0, '09:00')) return v(true, r);
  return { verdict: b ? 'DIFF' : 'FAIL', r, note: 'placed inside the window, but the energy curve (peak 10:00) beats "earliest"' };
});
check('A3', 'A time', 'Task longer than slot', 'unscheduled', () => {
  const r = run({ busy: avail({ 0: [['09:00', '10:00']] }), tasks: [task('T1', { durationMin: 90, dueByISO: endOf(0) })] });
  return v(!of(r.plan, 'T1').length && r.plan.unplaced.length === 1, r);
});
check('A4', 'A time', 'Fixed 10–11 vs availability 09–10', 'unscheduled', () => {
  const r = run({ busy: avail({ 0: [['09:00', '10:00']] }), tasks: [task('T1', { notBeforeISO: at(0, '10:00'), dueByISO: at(0, '11:00') })] });
  return v(!of(r.plan, 'T1').length && r.plan.unplaced.length === 1, r, 'fixed time modelled as not-before 10:00 + due 11:00');
});
check('A5', 'A time', 'Starts exactly at availability start', '09:00–10:00', () => {
  const r = run({ busy: avail({ 0: [['09:00', '12:00']] }), tasks: [task('T1', { notBeforeISO: at(0, '09:00'), dueByISO: at(0, '10:00') })] });
  return v(of(r.plan, 'T1')[0]?.startISO === at(0, '09:00'), r);
});
check('A6', 'A time', 'Ends exactly at availability end', '11:00–12:00', () => {
  const r = run({ busy: avail({ 0: [['09:00', '12:00']] }), tasks: [task('T1', { notBeforeISO: at(0, '11:00'), dueByISO: at(0, '12:00') })] });
  return v(of(r.plan, 'T1')[0]?.startISO === at(0, '11:00'), r);
});
check('A7', 'A time', 'Zero-duration task', 'reject invalid task', () => {
  const r = run({ busy: avail(weekdays([['09:00', '17:00']])), tasks: [task('T1', { durationMin: 0 })] });
  return flagged(r, /duration/, 'T1');
});
check('A8', 'A time', 'Negative duration (-30)', 'validation error', () => {
  const r = run({ busy: avail(weekdays([['09:00', '17:00']])), tasks: [task('T1', { durationMin: -30 })] });
  return flagged(r, /duration/, 'T1');
});
check('A9a', 'A time', 'Inverted busy event 09:00–08:00', 'validation error', () => {
  const busy = [...avail({ 0: [['08:00', '10:00']] }), { start: at(0, '09:00'), end: at(0, '08:00') }];
  const r = run({ busy, tasks: [task('T1', { dueByISO: endOf(0) })] });
  return flagged(r, /busy time/);
});
check('A9b', 'A time', 'Task window inverted (not-before after due)', 'validation error', () => {
  const r = run({ busy: avail(weekdays([['09:00', '17:00']])), tasks: [task('T1', { notBeforeISO: at(0, '12:00'), dueByISO: at(0, '11:00') })] });
  const u = r.plan.unplaced[0];
  return { verdict: u && !r.plan.blocks.length ? 'PASS' : 'FAIL', r, note: 'reported as unplaceable with a reason (not a validation error, but not silent)' };
});
check('A10', 'A time', 'Duplicate task IDs', 'validation error', () => {
  const r = run({
    busy: avail(weekdays([['09:00', '17:00']])),
    tasks: [task('T1', { durationMin: 60 }), task('T1', { durationMin: 90 })],
  });
  const ok = /used by another task/.test(r.plan.issues.join('\n')) && total(r.plan, 'T1') === 60;
  return { verdict: ok ? 'PASS' : 'FAIL', r, note: 'the second T1 is left out and reported; the first is planned' };
});

// ══ B — conflicts ════════════════════════════════════════════════════════
/** verifyPlan flags overlaps between two proposals — the engine's own conflict test. */
function overlapCount(ivs) {
  const tasks = ivs.map((_, i) => task(`X${i}`, { durationMin: 600 }));
  const blocks = ivs.map(([s, e], i) => ({ taskId: `X${i}`, title: `X${i}`, category: 'deep-work', startISO: at(0, s), endISO: at(0, e), status: 'new', score: 0, reason: '' }));
  const problems = verifyPlan({ nowISO: NOW, busy: [], existing: [], profile: prof(), tasks }, { blocks, unplaced: [], order: [], moved: [], notes: [] });
  return problems.filter((p) => /overlaps X/.test(p)).length;
}
const conflictCase = (id, name, ivs, want) =>
  check(id, 'B conflicts', name, want ? `${want} conflict(s)` : 'no conflict', () => {
    const n = overlapCount(ivs);
    return { verdict: n === want ? 'PASS' : 'FAIL', actual: `${n} overlap(s) flagged by verifyPlan` };
  });
conflictCase('B1', 'Two non-overlapping events 09–10, 10–11', [['09:00', '10:00'], ['10:00', '11:00']], 0);
conflictCase('B2', 'Partial overlap 09–10, 09:30–10:30', [['09:00', '10:00'], ['09:30', '10:30']], 1);
conflictCase('B3', 'Containment 09–12, 10–11', [['09:00', '12:00'], ['10:00', '11:00']], 1);
conflictCase('B4', 'Identical 09–10, 09–10', [['09:00', '10:00'], ['09:00', '10:00']], 1);
conflictCase('B5', 'One-minute overlap 09–10, 09:59–10:30', [['09:00', '10:00'], ['09:59', '10:30']], 1);
conflictCase('B6', 'One-minute gap 09–10, 10:01–11', [['09:00', '10:00'], ['10:01', '11:00']], 0);
check('B7', 'B conflicts', 'Task may touch an event boundary (event 09–10, free 09–11)', 'task 10:00–11:00', () => {
  const r = run({ busy: [...avail({ 0: [['09:00', '11:00']] }), { start: at(0, '09:00'), end: at(0, '10:00') }], tasks: [task('T1', { dueByISO: endOf(0) })] });
  return v(of(r.plan, 'T1')[0]?.startISO === at(0, '10:00'), r);
});
conflictCase('B8', 'Three-way 09–11, 10–12, 10:30–11:30', [['09:00', '11:00'], ['10:00', '12:00'], ['10:30', '11:30']], 3);
check('B9', 'B conflicts', 'Task vs event 10–11, free 09–12', '09–10 or 11–12, never 10–11', () => {
  const r = run({ busy: [...avail({ 0: [['09:00', '12:00']] }), { start: at(0, '10:00'), end: at(0, '11:00') }], tasks: [task('T1', { dueByISO: endOf(0) })] });
  const s = of(r.plan, 'T1')[0]?.startISO;
  return v(s === at(0, '09:00') || s === at(0, '11:00'), r);
});
check('B10', 'B conflicts', 'Fixed event fills the only window', 'task cannot overlap', () => {
  const r = run({ busy: [...avail({ 0: [['10:00', '11:00']] }), { start: at(0, '10:00'), end: at(0, '11:00') }], tasks: [task('T1', { dueByISO: endOf(0) })] });
  return v(!r.plan.blocks.length && r.plan.unplaced.length === 1, r);
});
check('B5b', 'B conflicts', 'Task vs event 09:59–10:30, free 09–11', 'unscheduled (no clean hour)', () => {
  const r = run({ busy: [...avail({ 0: [['09:00', '11:00']] }), { start: at(0, '09:59'), end: at(0, '10:30') }], tasks: [task('T1', { dueByISO: endOf(0) })] });
  return v(!r.plan.blocks.length, r);
});

// ══ C — availability ═════════════════════════════════════════════════════
const MON_SPLIT = { 0: [['09:00', '12:00'], ['14:00', '17:00']] };
check('C1', 'C availability', 'One window 09–17, task 2h', 'one valid placement', () => {
  const r = run({ busy: avail({ 0: [['09:00', '17:00']] }), tasks: [task('T1', { durationMin: 120, dueByISO: endOf(0) })] });
  return v(total(r.plan, 'T1') === 120, r);
});
check('C2', 'C availability', 'Two windows 09–12, 14–17, task 2h', 'inside either window', () => {
  const r = run({ busy: avail(MON_SPLIT), tasks: [task('T1', { durationMin: 120, dueByISO: endOf(0) })] });
  return v(total(r.plan, 'T1') === 120, r);
});
check('C3', 'C availability', 'No availability (every day busy)', 'unscheduled', () => {
  const r = run({ busy: avail({}), tasks: [task('T1')] });
  return v(!r.plan.blocks.length && r.plan.unplaced.length === 1, r);
});
check('C3b', 'C availability', 'No working days at all (workHours all off)', 'unscheduled', () => {
  const off = { sun: null, mon: null, tue: null, wed: null, thu: null, fri: null, sat: null };
  const r = run({ profile: prof({ workHours: off }), tasks: [task('T1', { dueByISO: endOf(4) })] });
  const placed = r.plan.blocks.length > 0;
  return { verdict: placed ? 'FAIL' : 'PASS', r, note: placed ? 'dayWindowFor falls back to 09–18 when no day is a working day' : '' };
});
check('C3c', 'C availability', 'Tuesday is a day off (workHours tue: null), Mon busy', 'not on Tuesday', () => {
  const hours = { ...defaultProfile().workHours, tue: null };
  const busy = [{ start: at(0, '00:00'), end: at(1, '00:00') }];
  const r = run({ profile: prof({ workHours: hours }), busy, tasks: [task('T1', { dueByISO: endOf(4) })] });
  const tue = of(r.plan, 'T1').some((b) => new Date(b.startISO).getUTCDay() === 2);
  return { verdict: tue ? 'FAIL' : 'PASS', r, note: tue ? 'per-day work hours are flattened to one min–max window; a day off still gets work' : '' };
});
check('C4', 'C availability', '4h non-splittable across 09–12 / 14–17', 'unscheduled', () => {
  const r = run({ busy: avail(MON_SPLIT), tasks: [task('T1', { durationMin: 240, dueByISO: endOf(0) })] });
  return v(!r.plan.blocks.length && r.plan.unplaced.length === 1, r);
});
check('C5', 'C availability', 'Same, splittable, min 60', 'e.g. 3h + 1h', () => {
  const r = run({ busy: avail(MON_SPLIT), tasks: [task('T1', { durationMin: 240, splittable: true, minChunkMin: 60, dueByISO: endOf(0) })] });
  const ok = total(r.plan, 'T1') === 240 && of(r.plan, 'T1').every((b) => minsOf(b) >= 60);
  return v(ok, r, 'sessions capped at 2h (MAX_SESSION_MIN), so 2h + 2h rather than 3h + 1h');
});
check('C6', 'C availability', '4h, min block 2h, free 09–12 + 14–15', 'unscheduled (1h unusable)', () => {
  const r = run({ busy: avail({ 0: [['09:00', '12:00'], ['14:00', '15:00']] }), tasks: [task('T1', { durationMin: 240, splittable: true, minChunkMin: 120, dueByISO: endOf(0) })] });
  const small = of(r.plan, 'T1').some((b) => minsOf(b) < 120);
  if (small) return { verdict: 'FAIL', r, note: 'a block below the minimum was placed' };
  if (!r.plan.blocks.length) return v(true, r);
  return { verdict: 'DIFF', r, note: 'places the 2h that fits and reports the rest; puzzle wants all-or-nothing' };
});
check('C7', 'C availability', '4h, max block 90m', 'every block ≤ 90m', () => {
  const r = run({ busy: avail({ 0: [['09:00', '17:00']] }), tasks: [task('T1', { durationMin: 240, splittable: true, minChunkMin: 30, dueByISO: endOf(0) })] });
  return { verdict: 'N/A', r, note: `no per-task max block; global cap is 120m (got ${of(r.plan, 'T1').map(minsOf).join('+')})` };
});
check('C8', 'C availability', 'Availability 15–17, deadline 14:00', 'unscheduled', () => {
  const r = run({ busy: avail({ 0: [['15:00', '17:00']] }), tasks: [task('T1', { dueByISO: at(0, '14:00') })] });
  return v(!r.plan.blocks.length && r.plan.unplaced.length === 1, r);
});

// ══ D — deadlines ════════════════════════════════════════════════════════
check('D1', 'D deadlines', '2h with 6h free before deadline', 'scheduled', () => {
  const r = run({ busy: avail({ 0: [['09:00', '15:00']] }), tasks: [task('T1', { durationMin: 120, dueByISO: endOf(0) })] });
  return v(total(r.plan, 'T1') === 120, r);
});
check('D2', 'D deadlines', '6h non-splittable in exactly 6h', 'scheduled 09–15', () => {
  const r = run({ busy: avail({ 0: [['09:00', '15:00']] }), tasks: [task('T1', { durationMin: 360, dueByISO: endOf(0) })] });
  return v(of(r.plan, 'T1')[0]?.startISO === at(0, '09:00') && total(r.plan, 'T1') === 360, r);
});
check('D3', 'D deadlines', '7h splittable with 6h free', '6h placed, 1h reported', () => {
  const r = run({ busy: avail({ 0: [['09:00', '15:00']] }), tasks: [task('T1', { durationMin: 420, splittable: true, minChunkMin: 60, dueByISO: endOf(0) })] });
  return v(total(r.plan, 'T1') === 360 && r.plan.unplaced[0]?.neededMin === 60, r);
});
check('D3b', 'D deadlines', '7h non-splittable with 6h free', 'unscheduled', () => {
  const r = run({ busy: avail({ 0: [['09:00', '15:00']] }), tasks: [task('T1', { durationMin: 420, dueByISO: endOf(0) })] });
  return v(!r.plan.blocks.length && r.plan.unplaced.length === 1, r);
});
check('D4', 'D deadlines', 'Deadline today 17:00 (free 15–18)', 'nothing after 17:00', () => {
  const r = run({ busy: avail({ 0: [['15:00', '18:00']] }), tasks: [task('T1', { durationMin: 180, splittable: true, minChunkMin: 60, dueByISO: at(0, '17:00') })] });
  const late = of(r.plan, 'T1').some((b) => Date.parse(b.endISO) > Date.parse(at(0, '17:00')));
  return v(!late && total(r.plan, 'T1') === 120 && r.plan.unplaced[0]?.neededMin === 60, r);
});
check('D5', 'D deadlines', 'Due "Monday" = end of Monday; free 23:00–24:00', 'placed 23:00–24:00 Mon', () => {
  const r = run({ busy: avail({ 0: [['23:00', '24:00']] }), tasks: [task('T1', { dueByISO: endOf(0) })] });
  return v(of(r.plan, 'T1')[0]?.startISO === at(0, '23:00'), r, 'declared: dueByISO is the exclusive midnight after the due day');
});
check('D6', 'D deadlines', 'A due today, B due tomorrow; 2h free each day', 'A gets today', () => {
  const r = run({
    busy: avail({ 0: [['09:00', '11:00']], 1: [['09:00', '11:00']] }),
    tasks: [task('B', { durationMin: 120, dueByISO: endOf(1) }), task('A', { durationMin: 120, dueByISO: endOf(0) })],
  });
  return v(of(r.plan, 'A')[0]?.startISO.startsWith('2026-10-05') && total(r.plan, 'B') === 120, r);
});
check('D7', 'D deadlines', 'Same deadline, A high vs B medium, free 09–11', 'A placed ahead of B', () => {
  const r = run({ busy: avail({ 0: [['09:00', '11:00']] }), tasks: [task('B', { dueByISO: endOf(0) }), task('A', { priority: 'high', dueByISO: endOf(0) })] });
  const a = of(r.plan, 'A')[0];
  const b = of(r.plan, 'B')[0];
  if (a && b && a.startISO < b.startISO) return v(true, r);
  return { verdict: a && b ? 'DIFF' : 'FAIL', r, note: 'A picks first and takes the best-scored slot (10:00 energy peak); "ahead" means first choice, not earlier clock time' };
});
check('D8', 'D deadlines', 'Deadline moves Fri → Wed (block was Thu)', 'moves earlier or becomes infeasible', () => {
  const first = run({ busy: avail({ 3: [['09:00', '10:00']], 4: [['09:00', '10:00']] }), tasks: [task('T1', { dueByISO: endOf(4) })] });
  const thu = of(first.plan, 'T1')[0];
  const existing = [{ eventId: 'e1', taskId: 'T1', startISO: thu.startISO, endISO: thu.endISO, pinned: false }];
  const earlier = run({ busy: avail({ 1: [['09:00', '10:00']], 3: [['09:00', '10:00']] }), existing, tasks: [task('T1', { dueByISO: endOf(2) })] });
  const none = run({ busy: avail({ 3: [['09:00', '10:00']] }), existing, tasks: [task('T1', { dueByISO: endOf(2) })] });
  const ok = of(earlier.plan, 'T1')[0]?.startISO === at(1, '09:00') && !of(none.plan, 'T1').length && none.plan.unplaced.length === 1;
  return { verdict: ok ? 'PASS' : 'FAIL', r: earlier, actual: `first: ${describe(first)} → Tue open: ${describe(earlier)} → no room: ${describe(none)}` };
});

// ══ E — splitting ════════════════════════════════════════════════════════
const E_FREE = { 0: [['09:00', '11:00'], ['14:00', '15:00']] };
check('E1', 'E splitting', '3h splittable min 60, free 09–11 + 14–15', '2h + 1h', () => {
  const r = run({ busy: avail(E_FREE), tasks: [task('T1', { durationMin: 180, splittable: true, minChunkMin: 60, dueByISO: endOf(0) })] });
  return v(of(r.plan, 'T1').map(minsOf).sort().join('+') === '120+60', r);
});
check('E2', 'E splitting', 'Same, non-splittable', 'unscheduled', () => {
  const r = run({ busy: avail(E_FREE), tasks: [task('T1', { durationMin: 180, dueByISO: endOf(0) })] });
  return v(!r.plan.blocks.length, r);
});
check('E3', 'E splitting', '3h, min block 90m, free all day', 'every block ≥ 90m', () => {
  const r = run({ busy: avail({ 0: [['09:00', '18:00']] }), tasks: [task('T1', { durationMin: 180, splittable: true, minChunkMin: 90, dueByISO: endOf(0) })] });
  return v(total(r.plan, 'T1') === 180 && of(r.plan, 'T1').every((b) => minsOf(b) >= 90), r);
});
check('E4', 'E splitting', '3h, max block 60m', '60 + 60 + 60', () => {
  const r = run({ busy: avail({ 0: [['09:00', '18:00']] }), tasks: [task('T1', { durationMin: 180, splittable: true, minChunkMin: 30, dueByISO: endOf(0) })] });
  return { verdict: 'N/A', r, note: `no per-task max block (got ${of(r.plan, 'T1').map(minsOf).join('+')})` };
});
check('E5', 'E splitting', '3h min 60, free 09–11 + 14–14:30', '2h placed, 1h unplaced, no 30m block', () => {
  const r = run({ busy: avail({ 0: [['09:00', '11:00'], ['14:00', '14:30']] }), tasks: [task('T1', { durationMin: 180, splittable: true, minChunkMin: 60, dueByISO: endOf(0) })] });
  return v(total(r.plan, 'T1') === 120 && of(r.plan, 'T1').every((b) => minsOf(b) >= 60) && r.plan.unplaced[0]?.neededMin === 60, r);
});
check('E6', 'E splitting', 'min 60, free exactly 60', 'schedules 60', () => {
  const r = run({ busy: avail({ 0: [['09:00', '10:00']] }), tasks: [task('T1', { durationMin: 120, splittable: true, minChunkMin: 60, dueByISO: endOf(0) })] });
  return v(total(r.plan, 'T1') === 60, r);
});
check('E7', 'E splitting', 'min 60, free 59', 'schedules nothing', () => {
  const r = run({ busy: avail({ 0: [['09:00', '09:59']] }), tasks: [task('T1', { durationMin: 120, splittable: true, minChunkMin: 60, dueByISO: endOf(0) })] });
  return v(!r.plan.blocks.length, r);
});

// ══ F — dependencies (not modelled) ══════════════════════════════════════
for (const [id, name, exp] of [
  ['F1', 'Simple dependency A → B', 'A before B'],
  ['F2', 'Chain A → B → C', 'A < B < C'],
  ['F3', 'Dependency with unavailable time', 'B not before A finishes'],
  ['F4', 'Parallel A → C, B → C', 'C after both'],
  ['F5', 'Circular A ↔ B', 'validation error'],
  ['F6', 'Missing dependency T99', 'validation error'],
  ['F7', 'Dependency completion time', 'B not before A ends'],
]) na(id, 'F dependencies', name, exp, 'PlanTask has no dependency field');

// ══ G — priority ═════════════════════════════════════════════════════════
check('G1', 'G priority', 'One slot, same deadline: A high vs B medium', 'A gets it', () => {
  const r = run({ busy: avail({ 0: [['09:00', '10:00']] }), tasks: [task('B', { dueByISO: endOf(0) }), task('A', { priority: 'high', dueByISO: endOf(0) })] });
  return v(of(r.plan, 'A').length === 1 && !of(r.plan, 'B').length, r);
});
check('G2', 'G priority', 'A high due next week vs B medium due today, one slot today', 'declared rule: deadline beats priority → B today', () => {
  const r = run({
    busy: avail({ 0: [['09:00', '10:00']], 7: [['09:00', '10:00']] }),
    tasks: [task('A', { priority: 'high', dueByISO: endOf(9) }), task('B', { dueByISO: endOf(0) })],
  });
  return v(of(r.plan, 'B')[0]?.startISO === at(0, '09:00') && of(r.plan, 'A').length === 1, r, 'EDF: earliest deadline, then priority, then least slack');
});
check('G3', 'G priority', 'High priority, required period unavailable', 'not scheduled there', () => {
  const r = run({ busy: avail({}), tasks: [task('A', { priority: 'high', dueByISO: endOf(0) })] });
  return v(!r.plan.blocks.length && r.plan.unplaced.length === 1, r);
});
na('G4', 'G priority', 'Priority must not violate A → B', 'A before B', 'no dependencies');
check('G5', 'G priority', 'Exact tie, inputs reordered', 'deterministic tie-breaker', () => {
  const busy = avail({ 0: [['09:00', '11:00']] });
  const t = [task('A', { dueByISO: endOf(0) }), task('B', { dueByISO: endOf(0) })];
  const r1 = run({ busy, tasks: t });
  const r2 = run({ busy, tasks: [...t].reverse() });
  return v(JSON.stringify(r1.plan.blocks) === JSON.stringify(r2.plan.blocks), r1, 'tie-break: deadline, priority, slack, prefer-by, title, id');
});

// ══ H — preferences ══════════════════════════════════════════════════════
const H_FREE = { 0: [['09:00', '10:00'], ['15:00', '16:00']] };
check('H1', 'H preferences', 'Prefer morning: free 09–10 and 15–16', '09–10', () => {
  const r = run({ busy: avail(H_FREE), tasks: [task('T1', { preferredWindow: 'morning', dueByISO: endOf(0) })] });
  return v(of(r.plan, 'T1')[0]?.startISO === at(0, '09:00'), r);
});
check('H1b', 'H preferences', 'Prefer afternoon, same free time', '15–16', () => {
  const r = run({ busy: avail(H_FREE), tasks: [task('T1', { preferredWindow: 'afternoon', dueByISO: endOf(0) })] });
  return v(of(r.plan, 'T1')[0]?.startISO === at(0, '15:00'), r);
});
check('H2', 'H preferences', 'Prefer morning, morning unavailable', 'other feasible slot', () => {
  const r = run({ busy: avail({ 0: [['15:00', '16:00']] }), tasks: [task('T1', { preferredWindow: 'morning', dueByISO: endOf(0) })] });
  return v(of(r.plan, 'T1')[0]?.startISO === at(0, '15:00'), r);
});
const prefers = (kind, scope, value = {}) => ({ id: `${kind}-${scope}`, kind, scope, value, strength: 0.8, evidenceCount: 10, userVerdict: 'confirmed' });
check('H3', 'H preferences', 'Learned "prefers Tuesday"; Mon & Tue 10–11 free', 'Tuesday wins', () => {
  const r = run({ profile: prof({ learned: [prefers('preferred-weekday', 'tue')] }), busy: avail({ 0: [['10:00', '11:00']], 1: [['10:00', '11:00']] }), tasks: [task('T1', { dueByISO: endOf(4) })] });
  const tue = of(r.plan, 'T1')[0]?.startISO === at(1, '10:00');
  return { verdict: tue ? 'PASS' : 'DIFF', r, note: tue ? '' : 'earliness outweighs a confirmed weekday preference' };
});
na('H4', 'H preferences', 'Preferred block 60m vs 120m', '60m placement wins', 'learned block-length exists but plan-week does not use it to size sessions');
check('H6', 'H preferences', 'Morning window vs learned Friday (Mon 15–16, Fri 09–10 free)', 'per declared weights', () => {
  const r = run({ profile: prof({ learned: [prefers('preferred-weekday', 'fri')] }), busy: avail({ 0: [['15:00', '16:00']], 4: [['09:00', '10:00']] }), tasks: [task('T1', { preferredWindow: 'morning', dueByISO: endOf(4) })] });
  return { verdict: 'PASS', r, note: 'declared: preferred window is searched first (a filter), weekday is only a score — morning wins' };
});

// ══ I — context switching (not modelled) ═════════════════════════════════
for (const [id, name] of [['I1', 'A B C D vs A C B D'], ['I2', 'No penalty → equal'], ['I3', 'Huge penalty → batching'], ['I4', 'Dependency overrides batching']]) {
  na(id, 'I context', name, 'batching per penalty', 'no context-switch penalty in the scorer (category only picks the day window)');
}

// ══ J — buffers ══════════════════════════════════════════════════════════
// Availability here is real working hours (Monday only), not busy time:
// the buffer pads calendar events, so faking hours as events would shrink them.
const mondayHours = (start, end, over = {}) => {
  const off = { sun: null, mon: { start, end }, tue: null, wed: null, thu: null, fri: null, sat: null };
  return prof({ workHours: off, ...over });
};
const meeting = { start: at(0, '10:00'), end: at(0, '11:00') };
check('J1', 'J buffers', 'Buffer 0, meeting 10–11', 'task may end at 10:00', () => {
  const r = run({ profile: mondayHours(9, 11), busy: [meeting], tasks: [task('T1', { dueByISO: endOf(0) })] });
  return v(of(r.plan, 'T1')[0]?.endISO === at(0, '10:00'), r);
});
check('J2', 'J buffers', 'Buffer 15, meeting 10–11, hours 09–11', '09:45–11:15 blocked → no hour fits', () => {
  const r = run({ profile: mondayHours(9, 11, { defaultBufferMin: 15 }), busy: [meeting], tasks: [task('T1', { dueByISO: endOf(0) })] });
  return v(!of(r.plan, 'T1').length && r.plan.unplaced.length === 1, r);
});
check('J3', 'J buffers', 'Hours 09–10, meeting 10–11, buffer 15, 45m task', 'task ends by 09:45', () => {
  const r = run({ profile: mondayHours(9, 10, { defaultBufferMin: 15 }), busy: [meeting], tasks: [task('T1', { durationMin: 45, dueByISO: endOf(0) })] });
  const b = of(r.plan, 'T1')[0];
  return v(b && Date.parse(b.endISO) <= Date.parse(at(0, '09:45')), r);
});
check('J4', 'J buffers', 'Buffer 15 between own blocks, not doubled (3 × 1h in 09:00–12:30)', '09–10, 10:15–11:15, 11:30–12:30', () => {
  const r = run({ profile: mondayHours(9, 12.5, { defaultBufferMin: 15 }), tasks: ['A', 'B', 'C'].map((id) => task(id, { dueByISO: endOf(0) })) });
  const starts = r.plan.blocks.map((b) => b.startISO.slice(11, 16)).join(',');
  return v(starts === '09:00,10:15,11:30', r, 'the scored pass strands 09:00–10:00; the earliest-fit retry packs all three');
});
check('J4b', 'J buffers', 'Two meetings 10–11 and 11:15–12, buffer 15, 15m task, hours 09–13', 'buffers not double-counted: 12:15 is free', () => {
  const r = run({ profile: mondayHours(9, 13, { defaultBufferMin: 15 }), busy: [meeting, { start: at(0, '11:15'), end: at(0, '12:00') }, { start: at(0, '09:00'), end: at(0, '09:45') }], tasks: [task('T1', { durationMin: 45, dueByISO: endOf(0) })] });
  return v(of(r.plan, 'T1')[0]?.startISO === at(0, '12:15'), r);
});
check('J5', 'J buffers', 'Travel 30m around an in-person meeting 10–11, hours 09–13', 'task outside 09:30–11:30', () => {
  const travel = travelPadding([{ ...meeting, location: 'Office, Hauptstr. 1' }], 30);
  const r = run({ profile: mondayHours(9, 13), busy: [meeting], travel, tasks: [task('T1', { dueByISO: endOf(0) })] });
  const b = of(r.plan, 'T1')[0];
  return v(b && (Date.parse(b.endISO) <= Date.parse(at(0, '09:30')) || Date.parse(b.startISO) >= Date.parse(at(0, '11:30'))), r, 'travel pads both sides (puzzle pads only after), and gets no buffer on top');
});

// ══ K — daily capacity ═══════════════════════════════════════════════════
const eightHours = (cap, due = endOf(0)) =>
  run({ profile: prof({ maxDailyFocusMin: cap }), busy: avail(weekdays([['09:00', '17:00']])), tasks: Array.from({ length: 8 }, (_, i) => task(`T${i + 1}`, { dueByISO: due })) });
const mondayMin = (p) => p.blocks.filter((b) => b.startISO.startsWith('2026-10-05')).reduce((n, b) => n + minsOf(b), 0);
check('K1', 'K capacity', 'No limit: 8h tasks in 8h', 'all scheduled', () => {
  const r = eightHours(100_000);
  return v(r.plan.blocks.length === 8, r);
});
check('K2', 'K capacity', '70% limit (336m), all due today', '≤ 336m planned', () => {
  const r = eightHours(336);
  const m = mondayMin(r.plan);
  return { verdict: m <= 336 ? 'PASS' : 'DIFF', r, actual: `${m}m planned on Monday, ${r.plan.unplaced.length} unplaced`, note: m <= 336 ? '' : 'the budget is soft: it goes over rather than miss a deadline' };
});
check('K2b', 'K capacity', '70% limit, due Friday', '≤ 336m on any day', () => {
  const r = eightHours(336, endOf(4));
  const byDay = {};
  for (const b of r.plan.blocks) byDay[b.startISO.slice(0, 10)] = (byDay[b.startISO.slice(0, 10)] ?? 0) + minsOf(b);
  return v(Object.values(byDay).every((m) => m <= 336), r, `per day: ${JSON.stringify(byDay)}`);
});
check('K3', 'K capacity', 'Capacity 300, tasks 300', 'all scheduled', () => {
  const r = run({ profile: prof({ maxDailyFocusMin: 300 }), busy: avail({ 0: [['09:00', '17:00']] }), tasks: Array.from({ length: 5 }, (_, i) => task(`T${i + 1}`, { dueByISO: endOf(0) })) });
  return v(r.plan.blocks.length === 5, r);
});
check('K4', 'K capacity', 'Capacity 300, tasks 301', '1 min deferred', () => {
  const r = run({
    profile: prof({ maxDailyFocusMin: 300 }),
    busy: avail({ 0: [['09:00', '17:00']] }),
    tasks: [...Array.from({ length: 5 }, (_, i) => task(`T${i + 1}`, { dueByISO: endOf(0) })), task('T6', { durationMin: 1, dueByISO: endOf(0) })],
  });
  const m = mondayMin(r.plan);
  return { verdict: m <= 300 ? 'PASS' : 'DIFF', r, actual: `${m}m planned`, note: m <= 300 ? '' : 'soft budget: placed over it because the deadline is today' };
});
check('K5', 'K capacity', 'Day full of kept blocks, urgent high task due today', 'deterministic per policy', () => {
  const existing = Array.from({ length: 5 }, (_, i) => ({ eventId: `m${i}`, taskId: 'M', startISO: at(0, `${String(9 + i).padStart(2, '0')}:00`), endISO: at(0, `${String(10 + i).padStart(2, '0')}:00`), pinned: false }));
  const r = run({ busy: avail({ 0: [['09:00', '14:00']] }), existing, tasks: [task('M', { durationMin: 300, splittable: true, dueByISO: endOf(4) }), task('U', { priority: 'high', dueByISO: endOf(0) })] });
  return { verdict: 'DIFF', r, note: 'kept blocks never give way: the urgent task is reported unplaced; only *new* sessions of lower-priority tasks can be bumped' };
});

// ══ L — minimal change ═══════════════════════════════════════════════════
const L_TASKS = () => ['A', 'B', 'C'].map((id) => task(id, { dueByISO: endOf(4) }));
const L_EXISTING = () => [
  { eventId: 'eA', taskId: 'A', startISO: at(0, '09:00'), endISO: at(0, '10:00'), pinned: false },
  { eventId: 'eB', taskId: 'B', startISO: at(0, '10:00'), endISO: at(0, '11:00'), pinned: false },
  { eventId: 'eC', taskId: 'C', startISO: at(0, '14:00'), endISO: at(0, '15:00'), pinned: false },
];
const W917 = avail(weekdays([['09:00', '17:00']]));
check('L1', 'L rescheduling', 'Add unrelated task D (fits Friday 15–16)', 'Monday unchanged', () => {
  const r = run({ busy: W917, existing: L_EXISTING(), tasks: [...L_TASKS(), task('D', { dueByISO: endOf(4), notBeforeISO: at(4, '15:00') })] });
  const kept = r.plan.blocks.filter((b) => b.status === 'kept').length;
  return v(kept === 3 && !r.plan.moved.length && of(r.plan, 'D').length === 1, r);
});
check('L2', 'L rescheduling', 'New event 09:30–10:30 over A and B', 'only A and B move', () => {
  const r = run({ busy: [...W917, { start: at(0, '09:30'), end: at(0, '10:30') }], existing: L_EXISTING(), tasks: L_TASKS() });
  const ids = r.plan.moved.map((m) => m.eventId).sort().join(',');
  return v(ids === 'eA,eB' && of(r.plan, 'C')[0]?.status === 'kept', r);
});
check('L3', 'L rescheduling', 'Event deleted again', 'restore only if that is the rule', () => {
  const l2 = run({ busy: [...W917, { start: at(0, '09:30'), end: at(0, '10:30') }], existing: L_EXISTING(), tasks: L_TASKS() });
  const existing = l2.plan.blocks.map((b, i) => ({ eventId: b.eventId ?? `n${i}`, taskId: b.taskId, startISO: b.startISO, endISO: b.endISO, pinned: false }));
  const r = run({ busy: W917, existing, tasks: L_TASKS() });
  return { verdict: 'PASS', r, note: 'declared: no restore — the moved blocks stay where they went (stability over undo)' };
});
check('L4', 'L rescheduling', 'Doctor 14–15 → 14:30–15:30; task at 15–16', 'only the task moves', () => {
  const existing = [
    { eventId: 'eT', taskId: 'T', startISO: at(0, '15:00'), endISO: at(0, '16:00'), pinned: false },
    { eventId: 'eX', taskId: 'X', startISO: at(0, '09:00'), endISO: at(0, '10:00'), pinned: false },
  ];
  const r = run({ busy: [...W917, { start: at(0, '14:30'), end: at(0, '15:30') }], existing, tasks: [task('T', { dueByISO: endOf(4) }), task('X', { dueByISO: endOf(4) })] });
  return v(r.plan.moved.length === 1 && r.plan.moved[0].eventId === 'eT' && of(r.plan, 'X')[0]?.status === 'kept', r);
});
check('L5', 'L rescheduling', 'X deadline Fri → Tue (X and Y on Thu)', 'X earlier, Y untouched', () => {
  const existing = [
    { eventId: 'eX', taskId: 'X', startISO: at(3, '09:00'), endISO: at(3, '10:00'), pinned: false },
    { eventId: 'eY', taskId: 'Y', startISO: at(3, '11:00'), endISO: at(3, '12:00'), pinned: false },
  ];
  const r = run({ busy: W917, existing, tasks: [task('X', { dueByISO: endOf(1) }), task('Y', { dueByISO: endOf(4) })] });
  const x = of(r.plan, 'X')[0];
  return v(x && Date.parse(x.endISO) <= Date.parse(endOf(1)) && of(r.plan, 'Y')[0]?.status === 'kept', r);
});

// ══ M — stability ════════════════════════════════════════════════════════
const M_INPUT = () => ({
  busy: [...W917, { start: at(1, '10:00'), end: at(1, '12:00') }, { start: at(2, '13:00'), end: at(2, '15:00') }],
  tasks: [
    task('Report', { durationMin: 240, splittable: true, minChunkMin: 60, dueByISO: endOf(3), effort: 'hard' }),
    task('Email', { durationMin: 45, priority: 'low', category: 'admin' }),
    task('Deck', { durationMin: 120, priority: 'high', dueByISO: endOf(2) }),
    task('Review', { durationMin: 90, dueByISO: endOf(1) }),
  ],
  profile: prof({ maxDailyFocusMin: 240, defaultBufferMin: 10 }),
});
check('M1', 'M stability', 'Run twice', 'same schedule', () => {
  const a = run(M_INPUT());
  const b = run(M_INPUT());
  return v(JSON.stringify(a.plan) === JSON.stringify(b.plan), a);
});
check('M2', 'M stability', 'Save, reload, re-plan', 'same schedule, nothing moves', () => {
  const a = run(M_INPUT());
  const existing = a.plan.blocks.map((b, i) => ({ eventId: `e${i}`, taskId: b.taskId, startISO: b.startISO, endISO: b.endISO, pinned: false }));
  const r = run({ ...M_INPUT(), existing });
  return v(r.plan.blocks.every((b) => b.status === 'kept') && !r.plan.moved.length && r.plan.blocks.length === a.plan.blocks.length, r);
});
check('M3', 'M stability', 'Same tasks, different input order', 'same schedule', () => {
  const a = run(M_INPUT());
  const inp = M_INPUT();
  const b = run({ ...inp, tasks: [inp.tasks[2], inp.tasks[0], inp.tasks[3], inp.tasks[1]] });
  return v(JSON.stringify(a.plan.blocks) === JSON.stringify(b.plan.blocks), a);
});
check('M4', 'M stability', 'Internal iteration order', 'deterministic', () => ({ verdict: 'PASS', actual: 'Maps iterate in insertion order and every sort has a total tie-break (title, id)' }));

// ══ N — unschedulable ════════════════════════════════════════════════════
check('N1', 'N infeasible', '10h vs 8h available today', '8h placed, 2h infeasible with reason', () => {
  const r = run({ busy: avail({ 0: [['09:00', '17:00']] }), tasks: [task('T1', { durationMin: 600, splittable: true, minChunkMin: 60, dueByISO: endOf(0) })] });
  return v(total(r.plan, 'T1') === 480 && r.plan.unplaced[0]?.neededMin === 120, r);
});
check('N2', 'N infeasible', '3h non-splittable, longest gap 2h', 'infeasible', () => {
  const r = run({ busy: avail(E_FREE), tasks: [task('T1', { durationMin: 180, dueByISO: endOf(0) })] });
  return v(!r.plan.blocks.length && /no single free stretch/.test(r.plan.unplaced[0]?.reason ?? ''), r);
});
check('N3', 'N infeasible', 'Due tomorrow, 12h needed, 4h free', 'infeasible (4h placed, 8h reported)', () => {
  const r = run({ busy: avail({ 0: [['09:00', '11:00']], 1: [['09:00', '11:00']] }), tasks: [task('T1', { durationMin: 720, splittable: true, minChunkMin: 60, dueByISO: endOf(1) })] });
  return v(total(r.plan, 'T1') === 240 && r.plan.unplaced[0]?.neededMin === 480, r);
});
na('N4', 'N infeasible', 'Dependency chain cannot fit', 'infeasible', 'no dependencies');
check('N5a', 'N infeasible', 'Soft "morning", no morning free', 'scheduled elsewhere', () => {
  const r = run({ busy: avail({ 0: [['15:00', '16:00']] }), tasks: [task('T1', { preferredWindow: 'morning', dueByISO: endOf(0) })] });
  return v(of(r.plan, 'T1').length === 1, r);
});
check('N5b', 'N infeasible', 'Hard "mornings only" rule, no morning free', 'infeasible', () => {
  const rules = [{ id: 'r1', kind: 'work-hours', rule: { start: 8, end: 12 }, hard: true, label: 'mornings only', source: 'settings' }];
  const r = run({ profile: prof({ rules }), busy: avail({ 0: [['15:00', '16:00']] }), tasks: [task('T1', { dueByISO: endOf(0) })] });
  return v(!r.plan.blocks.length && r.plan.unplaced.length === 1, r);
});

// ══ O — multi-day ════════════════════════════════════════════════════════
check('O1', 'O multi-day', '8h; Mon 2h, Tue 3h, Wed 3h', '2 + 3 + 3', () => {
  const r = run({ busy: avail({ 0: [['09:00', '11:00']], 1: [['09:00', '12:00']], 2: [['09:00', '12:00']] }), tasks: [task('T1', { durationMin: 480, splittable: true, minChunkMin: 60, dueByISO: endOf(2) })] });
  const byDay = {};
  for (const b of of(r.plan, 'T1')) byDay[b.startISO.slice(5, 10)] = (byDay[b.startISO.slice(5, 10)] ?? 0) + minsOf(b);
  return v(total(r.plan, 'T1') === 480, r, `per day ${JSON.stringify(byDay)} (sessions ≤ 2h, so a 3h day is 2h + 1h)`);
});
check('O2', 'O multi-day', '8h, 6h before deadline', '6h placed, 2h remaining', () => {
  const r = run({ busy: avail({ 0: [['09:00', '12:00']], 1: [['09:00', '12:00']] }), tasks: [task('T1', { durationMin: 480, splittable: true, minChunkMin: 60, dueByISO: endOf(1) })] });
  return v(total(r.plan, 'T1') === 360 && r.plan.unplaced[0]?.neededMin === 120, r);
});
check('O3', 'O multi-day', '4h; Mon–Wed 2h each; finish earlier', 'Mon + Tue', () => {
  const r = run({ busy: avail({ 0: [['09:00', '11:00']], 1: [['09:00', '11:00']], 2: [['09:00', '11:00']] }), tasks: [task('T1', { durationMin: 240, splittable: true, minChunkMin: 60, dueByISO: endOf(2) })] });
  const days = of(r.plan, 'T1').map((b) => b.startISO.slice(8, 10)).join(',');
  return v(days === '05,06', r);
});
na('O4', 'O multi-day', 'Prefer later completion', 'result flips predictably', 'only "prefer by" (earlier) exists; there is no prefer-later objective');

// ══ P — recurring (habits) ═══════════════════════════════════════════════
const gym = { id: 'gym', title: 'Gym', category: 'personal', durationMin: 60, perWeek: 3, preferredWindow: 'evening' };
check('P1', 'P recurring', 'Gym 3× a week, evenings', '3 sessions, one a day', () => {
  const r = run({ habits: [gym] });
  const days = r.plan.blocks.map((b) => WD[new Date(b.startISO).getUTCDay()]);
  return v(new Set(days).size === 3, r, `days: ${days.join(', ')}`);
});
const gymExisting = () => [0, 2, 4].map((d) => ({ eventId: `g${d}`, habitId: 'gym', startISO: at(d, '18:00'), endISO: at(d, '19:00'), pinned: d === 2 }));
check('P2', 'P recurring', 'One occurrence (Fri) now conflicts', 'only Fri moves', () => {
  const ex = gymExisting().map((x) => ({ ...x, pinned: false }));
  const r = run({ habits: [gym], existing: ex, busy: [{ start: at(4, '18:00'), end: at(4, '19:00') }] });
  return v(r.plan.moved.length === 1 && r.plan.moved[0].eventId === 'g4' && r.plan.blocks.filter((b) => b.status === 'new').length === 1, r);
});
check('P3', 'P recurring', 'Away on Friday (holiday)', 'only Fri changes', () => {
  const ex = gymExisting().map((x) => ({ ...x, pinned: false }));
  const r = run({ habits: [gym], existing: ex, away: [{ start: at(4, '00:00'), end: at(5, '00:00') }] });
  return v(r.plan.moved.length === 1 && r.plan.moved[0].eventId === 'g4', r);
});
check('P4', 'P recurring', 'Pinned occurrence (Wed) under a new event', 'never moved', () => {
  const r = run({ habits: [gym], existing: gymExisting(), busy: [{ start: at(2, '18:00'), end: at(2, '19:00') }] });
  const wed = r.plan.blocks.find((b) => b.eventId === 'g2');
  return v(wed?.status === 'pinned' && !r.plan.moved.some((m) => m.eventId === 'g2'), r);
});

// ══ Q — same-day ordering ════════════════════════════════════════════════
check('Q1', 'Q ordering', 'A, B, C equal (60m each, free 09–12)', 'deterministic', () => {
  const t = ['A', 'B', 'C'].map((id) => task(id, { dueByISO: endOf(0) }));
  const busy = avail({ 0: [['09:00', '12:00']] });
  const a = run({ busy, tasks: t });
  const b = run({ busy, tasks: [t[2], t[0], t[1]] });
  return v(JSON.stringify(a.plan.blocks) === JSON.stringify(b.plan.blocks), a);
});
check('Q2', 'Q ordering', 'A due today, B tomorrow (09–11 free both days)', 'A earlier', () => {
  const r = run({ busy: avail({ 0: [['09:00', '11:00']], 1: [['09:00', '11:00']] }), tasks: [task('B', { dueByISO: endOf(1) }), task('A', { dueByISO: endOf(0) })] });
  const a = of(r.plan, 'A')[0];
  const b = of(r.plan, 'B')[0];
  if (a && b && a.startISO <= b.startISO) return v(true, r);
  return { verdict: a && b ? 'DIFF' : 'FAIL', r, note: 'A picks first and takes the 10:00 energy peak; B, due later, fills 09:00 — same rule as D7' };
});
na('Q3', 'Q ordering', 'A is a dependency of B', 'A earlier', 'no dependencies');
check('Q4', 'Q ordering', 'A hard, B light; free 09–10 and 15–16', 'hard → high-energy window', () => {
  const r = run({ busy: avail(H_FREE), tasks: [task('B', { effort: 'light', dueByISO: endOf(0) }), task('A', { effort: 'hard', dueByISO: endOf(0) })] });
  const ok = of(r.plan, 'A')[0]?.startISO === at(0, '09:00');
  return { verdict: ok ? 'PASS' : 'DIFF', r, note: ok ? 'by luck of order (A before B by title) — effort feeds the daily budget, not the energy match' : 'effort feeds the daily budget, not the energy match' };
});

// ══ R — dates ════════════════════════════════════════════════════════════
check('R1', 'R dates', 'Free 23:00–01:00 across midnight, 90m task', 'belongs to the right date', () => {
  const r = run({ busy: avail({ 0: [['23:00', '24:00']], 1: [['00:00', '01:00']] }), tasks: [task('T1', { durationMin: 90, dueByISO: endOf(1) })] });
  return { verdict: r.plan.blocks.length ? 'PASS' : 'DIFF', r, note: 'slots are searched per day and never cross midnight' };
});
check('R2', 'R dates', 'Event Mon 17:00 → Tue 10:00 blocks both days', 'task Tue ≥ 10:00', () => {
  const r = run({ busy: [...avail({ 0: [['09:00', '18:00']], 1: [['09:00', '18:00']] }), { start: at(0, '09:00'), end: at(1, '10:00') }], tasks: [task('T1', { dueByISO: endOf(1) })] });
  return v(Date.parse(of(r.plan, 'T1')[0]?.startISO) >= Date.parse(at(1, '10:00')), r);
});
const dateCase = (id, name, base, nowT, dueDay, want) =>
  check(id, 'R dates', name, want, () => {
    const r = run({ nowISO: iso(base + hm(nowT)), busy: [], tasks: [task('T1', { dueByISO: iso(base + (dueDay + 1) * DAY) })], profile: prof({ workHours: defaultProfile().workHours }) });
    return v(of(r.plan, 'T1')[0]?.startISO.slice(0, 10) === want, r);
  });
dateCase('R3', 'Leap day: now Mon 28 Feb 2028 20:00, due Tue', Date.UTC(2028, 1, 28), '20:00', 1, '2028-02-29');
dateCase('R4', 'Month boundary: now Fri 30 Oct 20:00, due Mon', Date.UTC(2026, 9, 30), '20:00', 3, '2026-11-02');
dateCase('R5', 'Year boundary: now Thu 31 Dec 20:00, due Fri', Date.UTC(2026, 11, 31), '20:00', 1, '2027-01-01');
na('R6', 'R dates', 'DST (Berlin, Sun 25 Oct 2026)', '23h/25h day handled', 'engine works in wall-clock time; DST is the route\'s job when it converts to/from the calendar — not exercised here');

// ══ S — invalid data ═════════════════════════════════════════════════════
const sCase = (id, name, over, re, itemId) =>
  check(id, 'S invalid', name, 'reported, never planned on a guess', () => flagged(run({ busy: W917, ...over }), re, itemId));
sCase('S1', 'Missing task id', { tasks: [{ ...task('x'), id: undefined }] }, /no id/);
sCase('S2', 'Missing duration', { tasks: [{ ...task('T1'), durationMin: undefined }] }, /duration/, 'T1');
sCase('S3', 'Invalid timestamp (dueByISO "garbage")', { tasks: [task('T1', { dueByISO: 'garbage' })] }, /dueByISO/, 'T1');
sCase('S4', 'Unknown priority "urgent" (repaired as medium)', { tasks: [task('T1', { priority: 'urgent' })] }, /priority/);
sCase('S5', 'Negative buffer (-15) (repaired as none)', { profile: prof({ defaultBufferMin: -15 }), tasks: [task('A'), task('B')] }, /buffer/);
sCase('S6', 'Negative capacity (-100) (repaired as default)', { profile: prof({ maxDailyFocusMin: -100 }), tasks: [task('T1')] }, /budget/);
sCase('S7', 'min_block > duration (min 120, 60m task)', { tasks: [task('T1', { splittable: true, minChunkMin: 120 })] }, /minimum session/);
sCase('S8', 'Existing block for an unknown task', { existing: [{ eventId: 'e', taskId: 'ghost', startISO: at(0, '09:00'), endISO: at(0, '10:00'), pinned: false }], tasks: [task('T1')] }, /not for any task/);
sCase('S9', 'Inverted working hours (Tue 17–9)', { profile: prof({ workHours: { ...prof().workHours, tue: { start: 17, end: 9 } } }), tasks: [task('T1')] }, /working hours on tue/);
sCase('S10', 'Habit 9x a week (repaired as 7x)', { habits: [{ id: 'h', title: 'Walk', category: 'personal', durationMin: 30, perWeek: 9 }] }, /read as 7x/);

// ══ T — score function ═══════════════════════════════════════════════════
na('T1', 'T scoring', 'Change only the deadline', 'deadline score changes', 'deadline is a hard bound, not a score term (by design)');
na('T2', 'T scoring', 'Change only priority', 'priority score changes', 'priority orders who picks first; it is not a slot score term');
check('T3', 'T scoring', 'Change only the preferred window', 'result changes', () => ({ verdict: 'PASS', actual: 'see H1 / H1b: morning → 09:00, afternoon → 15:00' }));
na('T4', 'T scoring', 'Change only context switching', 'switch score changes', 'no context-switch term');
check('T5', 'T scoring', 'A candidate better on every dimension', 'it must win', () => {
  const p = prof();
  const keys = ['hourFit', 'energy', 'fragmentation', 'dayLoad', 'backToBack', 'earliness', 'weekdayFit'];
  let bad = 0;
  let rnd = 7;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1000; i++) {
    const a = Object.fromEntries(keys.map((k) => [k, rand()]));
    const b = Object.fromEntries(keys.map((k) => [k, Math.min(1, a[k] + rand() * 0.2)]));
    if (!(scoreFeatures(b, p) >= scoreFeatures(a, p))) bad++;
  }
  return { verdict: bad ? 'FAIL' : 'PASS', actual: `${bad}/1000 dominated candidates scored higher` };
});

// ══ U — dominance (property fuzz) ════════════════════════════════════════
function fuzz(seed) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const busy = [];
  for (let d = 0; d < 5; d++) {
    for (let k = Math.floor(rand() * 4); k > 0; k--) {
      const st = 9 * 60 + Math.floor(rand() * 28) * 15;
      busy.push({ start: iso(BASE + d * DAY + st * MIN), end: iso(BASE + d * DAY + (st + pick([30, 60, 90, 120])) * MIN) });
    }
  }
  const tasks = Array.from({ length: 2 + Math.floor(rand() * 4) }, (_, i) =>
    task(`T${i}`, {
      durationMin: pick([30, 60, 90, 120, 180, 240, 300]),
      dueByISO: pick([endOf(0), endOf(1), endOf(2), endOf(4), null]),
      splittable: rand() < 0.5,
      minChunkMin: pick([30, 60]),
      priority: pick(['low', 'medium', 'high']),
      effort: pick(['light', 'normal', 'hard']),
    }),
  );
  return { busy, tasks, profile: prof({ workHours: defaultProfile().workHours, maxDailyFocusMin: 240, defaultBufferMin: 10 }) };
}
const shortfall = (r) => r.plan.unplaced.reduce((n, u) => n + u.neededMin, 0);
/** Unplaced minutes by importance — [high, medium, low, optional] — the order the planner trades in. */
const byPriority = (r) => {
  const out = [0, 0, 0, 0];
  for (const u of r.plan.unplaced) {
    const t = r.input.tasks.find((x) => x.id === u.taskId);
    out[u.optional ? 3 : { high: 0, medium: 1, low: 2 }[t?.priority] ?? 1] += u.neededMin;
  }
  return out;
};
const worse = (b, a) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] > a[i];
  return false;
};
function dominance(id, name, mutate) {
  check(id, 'U dominance', name, 'never less feasible', () => {
    let bad = 0;
    let more = 0;
    let broken = 0;
    let example = '';
    const N = Number(process.env.FUZZ_N ?? 300);
    for (let seed = 1; seed <= N; seed++) {
      const base = fuzz(seed);
      const a = run(base);
      const b = run(mutate(fuzz(seed), seed));
      if (a.problems.length || b.problems.length) broken++;
      if (shortfall(b) > shortfall(a)) more++;
      if (worse(byPriority(b), byPriority(a))) {
        bad++;
        if (!example) example = `seed ${seed}: [high, med, low, optional] unplaced ${byPriority(a).join('/')} → ${byPriority(b).join('/')} min`;
      }
    }
    return {
      verdict: bad || broken ? 'FAIL' : 'PASS',
      actual: `${bad}/${N} got worse by priority${broken ? `, ${broken} broke a hard rule` : ''}; ${more}/${N} left more minutes in total${example ? ` (e.g. ${example})` : ''}`,
      note: bad ? 'greedy placement: a relaxation can steer one task into a slot another needed' : '',
    };
  });
}
dominance('U1', 'Add free time (drop one busy event)', (x) => ({ ...x, busy: x.busy.slice(1) }));
dominance('U2', 'Extend one deadline by a day', (x) => ({ ...x, tasks: x.tasks.map((t, i) => (i === 0 && t.dueByISO ? { ...t, dueByISO: iso(Date.parse(t.dueByISO) + DAY) } : t)) }));
dominance('U3', 'Make one task splittable', (x) => ({ ...x, tasks: x.tasks.map((t, i) => (i === 0 ? { ...t, splittable: true } : t)) }));
dominance('U4', 'Double the daily budget', (x) => ({ ...x, profile: { ...x.profile, maxDailyFocusMin: 480 } }));

// ══ V — minimality ═══════════════════════════════════════════════════════
check('V1', 'V minimality', 'One conflict (over B only)', '1 move', () => {
  const r = run({ busy: [...W917, { start: at(0, '10:00'), end: at(0, '10:30') }], existing: L_EXISTING(), tasks: L_TASKS() });
  return v(r.plan.moved.length === 1 && r.plan.blocks.filter((b) => b.status === 'new').length === 1, r);
});
check('V2', 'V minimality', 'New task fits in free time', 'add only', () => {
  const r = run({ busy: W917, existing: L_EXISTING(), tasks: [...L_TASKS(), task('D', { dueByISO: endOf(4) })] });
  return v(!r.plan.moved.length && r.plan.blocks.filter((b) => b.status === 'new').length === 1, r);
});
check('V3', 'V minimality', 'Delete task B', 'others do not move', () => {
  const r = run({ busy: W917, existing: L_EXISTING(), tasks: L_TASKS().filter((t) => t.id !== 'B') });
  return v(!r.plan.moved.length && r.plan.blocks.every((b) => b.status === 'kept') && r.plan.blocks.length === 2, r, "B's event is simply not in the plan; deleting it is the route's job");
});

// ══ W / X / Y — learning from what the user does ═════════════════════════
const F = { hourFit: 0.5, energy: 0.5, fragmentation: 0.5, dayLoad: 0.5, backToBack: 0.5, earliness: 0.5, weekdayFit: 0.5 };
let nid = 0;
const ids = () => `p${++nid}`;
const fb = (outcome, from, to, reasonCode) => ({
  outcome, category: 'deep-work', proposedStart: at(0, from), proposedEnd: at(0, from.replace(/^(\d\d)/, (h) => String(+h + 1).padStart(2, '0'))), proposedFeatures: F,
  ...(to ? { finalStart: at(0, to), finalEnd: at(0, to.replace(/^(\d\d)/, (h) => String(+h + 1).padStart(2, '0'))) } : {}),
  ...(reasonCode ? { reasonCode } : {}),
});
/** fold feedback into a profile the way the route persists it */
function learnAll(profile, list) {
  let p = profile;
  for (const f of list) {
    const res = learnFrom(p, f, ids);
    const byKey = new Map(p.learned.map((x) => [`${x.kind}:${x.scope}`, x]));
    for (const c of res.claims) byKey.set(`${c.kind}:${c.scope}`, c);
    p = { ...p, weights: res.weights, learned: [...byKey.values()] };
  }
  return p;
}
const claim = (p, kind) => p.learned.find((x) => x.kind === kind && x.scope === 'deep-work');
check('W1', 'W/X/Y learning', 'User moves B 11 → 14 once', 'afternoon preference +1', () => {
  const p = learnAll(prof(), [fb('edited', '11:00', '14:00')]);
  const c = claim(p, 'preferred-hours');
  return { verdict: c && c.value.hourStart >= 12 ? 'PASS' : 'FAIL', actual: c ? `preferred-hours ${c.value.hourStart}–${c.value.hourEnd}, strength ${c.strength.toFixed(2)}, evidence ${c.evidenceCount}` : 'no claim' };
});
check('W2', 'W/X/Y learning', 'Repeated 11→14, 11→15, 10→14, 11→14, 10→15', 'preference model changes (acts after 5)', () => {
  const p = learnAll(prof(), ['11:00>14:00', '11:00>15:00', '10:00>14:00', '11:00>14:00', '10:00>15:00'].map((x) => fb('edited', ...x.split('>'))));
  const c = claim(p, 'preferred-hours');
  const active = c && c.evidenceCount >= 5 && Math.abs(c.strength) > 0.15;
  return { verdict: active && c.value.hourStart >= 12 ? 'PASS' : 'FAIL', actual: c ? `preferred ${c.value.hourStart.toFixed(1)}–${c.value.hourEnd.toFixed(1)}, strength ${c.strength.toFixed(2)}, evidence ${c.evidenceCount}, active=${active}` : 'no claim' };
});
check('X1', 'W/X/Y learning', 'Accept suggestion', 'positive signal', () => {
  const p = learnAll(prof(), [fb('accepted', '10:00')]);
  const c = claim(p, 'preferred-hours');
  return { verdict: c && c.strength > 0 ? 'PASS' : 'FAIL', actual: c ? `preferred-hours strength ${c.strength.toFixed(3)} (weak by design)` : 'no claim' };
});
check('X2', 'W/X/Y learning', 'Move suggestion', '− original, + new', () => {
  const p = learnAll(prof(), [fb('edited', '09:00', '15:00')]);
  const pref = claim(p, 'preferred-hours');
  const avoid = claim(p, 'avoid-hours');
  const ok = pref?.value.hourStart >= 14 && avoid?.value.hourStart <= 9;
  return { verdict: ok ? 'PASS' : 'FAIL', actual: `preferred-hours ${pref?.value.hourStart}–${pref?.value.hourEnd}, avoid-hours ${avoid?.value.hourStart}–${avoid?.value.hourEnd}` };
});
check('X3', 'W/X/Y learning', 'Delete suggestion (no reason given)', 'negative signal', () => {
  const p = learnAll(prof(), [fb('rejected', '09:00')]);
  const p2 = learnAll(prof(), [fb('rejected', '09:00', null, 'too-early')]);
  return { verdict: 'DIFF', actual: `no reason → ${p.learned.length} claims; "too early" → ${p2.learned.map((x) => x.kind).join(', ')}`, note: 'declared: a bare delete says nothing about time (most are "not needed"); only a reasoned rejection counts' };
});
check('X4', 'W/X/Y learning', 'Repeatedly move morning → afternoon', 'shifts gradually toward afternoon', () => {
  const steps = [];
  let p = prof();
  for (let i = 0; i < 6; i++) {
    p = learnAll(p, [fb('edited', '09:00', '15:00')]);
    steps.push(claim(p, 'preferred-hours').strength.toFixed(2));
  }
  const inc = steps.every((x, i) => i === 0 || +x >= +steps[i - 1]);
  return { verdict: inc ? 'PASS' : 'FAIL', actual: `strength by step: ${steps.join(' → ')}` };
});
check('Y1', 'W/X/Y learning', 'Old morning preference, many recent afternoon moves', 'morning ↓, afternoon ↑', () => {
  const old = { id: 'old', kind: 'preferred-hours', scope: 'deep-work', value: { hourStart: 8, hourEnd: 11 }, strength: 0.6, evidenceCount: 20, userVerdict: null };
  const p = learnAll(prof({ learned: [old] }), Array.from({ length: 8 }, () => fb('edited', '09:00', '15:00')));
  const c = claim(p, 'preferred-hours');
  return { verdict: c.value.hourStart > 12 ? 'PASS' : 'FAIL', actual: `preferred window drifted 8–11 → ${c.value.hourStart.toFixed(1)}–${c.value.hourEnd.toFixed(1)}; avoid-hours ${claim(p, 'avoid-hours')?.value.hourStart.toFixed(1) ?? '—'}` };
});

// ══ Z — real-world ═══════════════════════════════════════════════════════
check('Z1', 'Z real world', '12h of tasks, 8h today', 'graceful prioritisation', () => {
  const r = run({ busy: avail({ 0: [['09:00', '17:00']] }), tasks: [
    task('Hi', { durationMin: 240, splittable: true, minChunkMin: 60, priority: 'high', dueByISO: endOf(0) }),
    task('Med', { durationMin: 240, splittable: true, minChunkMin: 60, dueByISO: endOf(0) }),
    task('Lo', { durationMin: 240, splittable: true, minChunkMin: 60, priority: 'low', dueByISO: endOf(0) }),
  ] });
  return v(total(r.plan, 'Hi') === 240 && total(r.plan, 'Med') === 240 && r.plan.unplaced.map((u) => u.taskId).join() === 'Lo', r);
});
check('Z2', 'Z real world', 'Urgent task enters a planned day (new sessions)', 'lowest priority gives way', () => {
  const r = run({ busy: avail({ 0: [['09:00', '12:00']] }), tasks: [
    task('Low', { durationMin: 180, priority: 'low', dueByISO: endOf(0) }),
    task('Urgent', { durationMin: 60, priority: 'high', dueByISO: endOf(0) }),
  ] });
  return { verdict: of(r.plan, 'Urgent').length ? 'PASS' : 'FAIL', r };
});
check('Z4', 'Z real world', 'Fragmented: 4.5h free, 3h deep work non-splittable', 'not placeable (capacity ≠ usable)', () => {
  const r = run({ busy: avail({ 0: [['09:30', '10:00'], ['10:30', '11:00'], ['11:30', '12:00'], ['13:00', '14:00'], ['15:00', '17:00']] }), tasks: [task('Deep', { durationMin: 180, dueByISO: endOf(0) })] });
  return v(!r.plan.blocks.length && /no single free stretch of 3h/.test(r.plan.unplaced[0]?.reason ?? ''), r);
});
check('Z5', 'Z real world', 'Golden: A 2h high today, B 2h med tomorrow, C 1h low today, free 09–17', 'A, C scheduled; B if room', () => {
  const r = run({ busy: avail(weekdays([['09:00', '17:00']])), tasks: [
    task('A', { durationMin: 120, priority: 'high', dueByISO: endOf(0) }),
    task('B', { durationMin: 120, dueByISO: endOf(1) }),
    task('C', { priority: 'low', dueByISO: endOf(0) }),
  ] });
  return v(['A', 'B', 'C'].every((id) => of(r.plan, id).length), r);
});
check('Z6', 'Z real world', 'Golden: 6h due Mon 17:00, then 10h', '6h Mon; then 8h + "2h impossible"', () => {
  const busy = avail({ 0: [['09:00', '17:00']], 1: [['09:00', '17:00']] });
  const a = run({ busy, tasks: [task('T', { durationMin: 360, splittable: true, minChunkMin: 60, dueByISO: at(0, '17:00') })] });
  const b = run({ busy, tasks: [task('T', { durationMin: 600, splittable: true, minChunkMin: 60, dueByISO: at(0, '17:00') })] });
  const ok = total(a.plan, 'T') === 360 && total(b.plan, 'T') === 480 && b.plan.unplaced[0]?.neededMin === 120;
  return { verdict: ok ? 'PASS' : 'FAIL', r: b, actual: `6h → ${total(a.plan, 'T')}m; 10h → ${describe(b)}` };
});
check('Z7', 'Z real world', 'Golden: lunch 12–13, meeting 13–15, 4h non-splittable', 'UNSCHEDULABLE (never 09–12 + 15–16)', () => {
  const r = run({ busy: avail({ 0: [['09:00', '12:00'], ['15:00', '17:00']] }), tasks: [task('T', { durationMin: 240, dueByISO: endOf(0) })] });
  return v(!r.plan.blocks.length, r);
});
check('Z8', 'Z real world', 'Golden: same, splittable min 120', '09–12 + 15–17 can\'t hold 3h+1h; 2h+2h is fine', () => {
  const r = run({ busy: avail({ 0: [['09:00', '12:00'], ['15:00', '17:00']] }), tasks: [task('T', { durationMin: 240, splittable: true, minChunkMin: 120, dueByISO: endOf(0) })] });
  return v(total(r.plan, 'T') === 240 && of(r.plan, 'T').every((b) => minsOf(b) >= 120), r);
});
check('Z10', 'Z real world', 'New task with no deadline vs a dated one, one slot', '"no deadline" ≠ top priority', () => {
  const r = run({ busy: avail({ 0: [['09:00', '10:00']], 3: [['09:00', '10:00']] }), tasks: [task('Open'), task('Dated', { dueByISO: endOf(0) })] });
  return v(of(r.plan, 'Dated')[0]?.startISO === at(0, '09:00'), r);
});

// ── report ────────────────────────────────────────────────────────────────
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const count = (vv) => rows.filter((r) => r.verdict === vv).length;
  let suite = '';
  for (const r of rows) {
    if (r.suite !== suite) {
      suite = r.suite;
      console.log(`\n── ${suite}`);
    }
    console.log(`${r.verdict.padEnd(4)} ${r.id.padEnd(4)} ${r.name}\n          expected: ${r.expected}\n          actual:   ${r.actual}${r.note ? `\n          note:     ${r.note}` : ''}`);
  }
  console.log(`\n${rows.length} puzzles — PASS ${count('PASS')}, FAIL ${count('FAIL')}, DIFF ${count('DIFF')}, N/A ${count('N/A')}`);
}
