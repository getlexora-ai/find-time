/**
 * nvidia/Nemotron-RL-agent-calendar_scheduling (first 500 train rows), run the
 * Find time way: a reader copies each event's latest length and condition
 * from what the user said; code turns conditions into times and places the
 * day. The reader sees the user's turns only — the dataset's assistant turns
 * are another model's past outputs and may be wrong.
 *
 *   node src/server/ai/eval/nemotron.mjs oracle                 # placement with a perfect reading
 *   node src/server/ai/eval/nemotron.mjs batches <size>         # task files for a reader, nemotron/runs/
 *   node src/server/ai/eval/nemotron.mjs score <file.jsonl>...  # score any reader's output
 *
 * Reader output, one line per conversation:
 *   {"id": "nemo-094", "events": [{"id": 0, "durationMin": 90, "constraint": ["after", "12:15 pm"]},
 *                                 {"id": 1, "durationMin": 30, "constraint": ["between", "10am", "12pm"]},
 *                                 {"id": 2, "durationMin": 30, "constraint": null}]}
 *
 * Correct = the dataset's own check: every expected event present once, its
 * length right, inside 10:00–16:00, its condition met ("before" = ends by,
 * "after" = starts at or after, "at" = starts at, "between" = inside), and no
 * two events overlap.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findFreeSlots } from '../find-time.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, 'nemotron', 'calendar-500.jsonl');
const DAY = Date.UTC(2026, 9, 5);
const DAY_START = 10 * 60;
const DAY_END = 16 * 60;
const STEP = 15;

const load = (path) => readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

/** "12:15 pm", "10am", "2 PM", "14:30", "noon" → minutes after midnight, or NaN. */
export function minutesOf(text) {
  const s = String(text).trim().toLowerCase();
  if (/^(12\s*)?noon$|^midday$/.test(s)) return 720;
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/.exec(s);
  if (!m) return NaN;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const mer = m[3]?.[0];
  if (mer === 'p' && h < 12) h += 12;
  if (mer === 'a' && h === 12) h = 0;
  return h * 60 + min;
}

/** The dataset's condition string ("before 11am", "between 10am and 12pm") as a reader would copy it. */
function parseExpected(c) {
  if (!c) return null;
  const between = /^between (.+) and (.+)$/i.exec(c);
  if (between) return ['between', between[1], between[2]];
  const m = /^(at|before|after) (.+)$/i.exec(c);
  return m ? [m[1].toLowerCase(), m[2]] : ['unreadable', c];
}

/** [earliest start, latest end] for one event, in minutes. */
function window(ev) {
  const c = ev.constraint;
  if (!c) return [DAY_START, DAY_END];
  const [kind, a, b] = c;
  const ta = minutesOf(a);
  if (kind === 'at') return [ta, ta + ev.durationMin];
  if (kind === 'before') return [DAY_START, ta];
  if (kind === 'after') return [ta, DAY_END];
  if (kind === 'between') return [ta, minutesOf(b)];
  return [NaN, NaN];
}

const iso = (min) => new Date(DAY + min * 60_000).toISOString();
const minOf = (isoStr) => (Date.parse(isoStr) - DAY) / 60_000;

/**
 * Place every event. First the planner's own way: fixed times first, then
 * tightest deadline, each by `findFreeSlots` against what is already placed.
 * If that greedy pass can't fit one, an exhaustive search over the 15-minute
 * grid (≤ 7 events, so small). Returns { calendar, greedy } or null.
 */
export function place(events) {
  const evs = events.map((e) => ({ ...e, win: window(e) }));
  if (evs.some((e) => !Number.isFinite(e.win[0]) || !Number.isFinite(e.win[1]) || !(e.durationMin > 0))) return null;
  const order = [...evs].sort(
    (a, b) => Number(b.constraint?.[0] === 'at') - Number(a.constraint?.[0] === 'at') || a.win[1] - b.win[1] || a.win[1] - a.win[0] - (b.win[1] - b.win[0]),
  );

  const greedy = [];
  for (const e of order) {
    const busy = greedy.map((g) => ({ start: iso(g.start), end: iso(g.start + g.durationMin) }));
    const lo = Math.max(DAY_START, e.win[0]);
    const hi = Math.min(DAY_END, e.win[1]);
    const [slot] = hi > lo ? findFreeSlots(busy, { durationMin: e.durationMin, count: 1, earliestISO: iso(lo), latestISO: iso(hi), dayStartHour: 0, dayEndHour: 24, bufferMin: 0 }) : [];
    if (!slot) break;
    greedy.push({ id: e.id, start: minOf(slot.startISO), durationMin: e.durationMin });
  }
  if (greedy.length === order.length) return { calendar: greedy, greedy: true };

  const placed = [];
  const fits = (s, d) => placed.every((p) => s + d <= p.start || s >= p.start + p.durationMin);
  const dfs = (i) => {
    if (i === order.length) return true;
    const e = order[i];
    const lo = Math.max(DAY_START, e.win[0]);
    const hi = Math.min(DAY_END, e.win[1]) - e.durationMin;
    for (let s = Math.ceil(lo / STEP) * STEP; s <= hi; s += STEP) {
      if (!fits(s, e.durationMin)) continue;
      placed.push({ id: e.id, start: s, durationMin: e.durationMin });
      if (dfs(i + 1)) return true;
      placed.pop();
    }
    return false;
  };
  return dfs(0) ? { calendar: placed, greedy: false } : null;
}

/** The dataset's check, against its expected state. Returns '' when correct, else why not. */
export function check(calendar, expected) {
  if (!calendar) return 'no calendar';
  const want = Object.values(expected);
  const got = new Map(calendar.map((c) => [Number(c.id), c]));
  if (got.size !== calendar.length) return 'duplicate event';
  if (got.size !== want.length) return `events ${got.size} ≠ ${want.length}`;
  for (const w of want) {
    const c = got.get(w.event_id);
    if (!c) return `event ${w.event_id} missing`;
    if (c.durationMin !== w.duration) return `event ${w.event_id} length ${c.durationMin} ≠ ${w.duration}`;
    const end = c.start + c.durationMin;
    if (c.start < minutesOf(w.min_time) || end > minutesOf(w.max_time)) return `event ${w.event_id} outside the day`;
    const k = parseExpected(w.constraint);
    if (k) {
      const [kind, a, b] = k;
      const ok =
        kind === 'at' ? c.start === minutesOf(a) : kind === 'before' ? end <= minutesOf(a) : kind === 'after' ? c.start >= minutesOf(a) : kind === 'between' ? c.start >= minutesOf(a) && end <= minutesOf(b) : false;
      if (!ok) return `event ${w.event_id} breaks "${w.constraint}"`;
    }
  }
  const s = [...calendar].sort((a, b) => a.start - b.start);
  for (let i = 1; i < s.length; i++) if (s[i].start < s[i - 1].start + s[i - 1].durationMin) return 'overlap';
  return '';
}

/** What the reader got wrong, against the expected state, for the miss list. */
function readingDiff(x, expected) {
  const out = [];
  const want = new Map(Object.values(expected).map((w) => [w.event_id, w]));
  for (const e of x.events ?? []) {
    const w = want.get(Number(e.id));
    if (!w) {
      out.push(`extra event ${e.id}`);
      continue;
    }
    if (e.durationMin !== w.duration) out.push(`#${e.id} length ${e.durationMin}≠${w.duration}`);
    const exp = parseExpected(w.constraint);
    const win = (c) => JSON.stringify(window({ durationMin: w.duration, constraint: c }));
    if (win(e.constraint) !== win(exp)) out.push(`#${e.id} ${JSON.stringify(e.constraint)} vs "${w.constraint}"`);
  }
  for (const id of want.keys()) if (!(x.events ?? []).some((e) => Number(e.id) === id)) out.push(`missing #${id}`);
  return out;
}

function report(rows, readerFor) {
  const by = {};
  let greedyHits = 0;
  const misses = [];
  for (const r of rows) {
    const n = Object.keys(r.expected).length;
    const keys = [n === 1 ? '1 event' : n <= 3 ? '2–3 events' : n <= 5 ? '4–5 events' : '6–7 events', 'all'];
    for (const k of keys) by[k] ??= { n: 0, ok: 0 };
    const x = readerFor(r);
    const res = x ? place(x.events ?? []) : null;
    if (res?.greedy) greedyHits++;
    const why = check(res?.calendar ?? null, r.expected);
    for (const k of keys) {
      by[k].n++;
      if (!why) by[k].ok++;
    }
    if (why) misses.push({ id: r.id, why, reading: x ? readingDiff(x, r.expected) : ['no reader output'] });
  }
  for (const k of ['1 event', '2–3 events', '4–5 events', '6–7 events', 'all']) {
    const t = by[k];
    if (t) console.log(`${k.padEnd(11)} ${String(t.ok).padStart(4)}/${String(t.n).padEnd(4)} ${((100 * t.ok) / t.n).toFixed(1).padStart(5)}%`);
  }
  console.log(`placed by the greedy findFreeSlots pass alone: ${greedyHits}/${rows.length}`);
  return misses;
}

const [cmd, ...args] = process.argv.slice(2);
const rows = load(DATA);

if (cmd === 'oracle') {
  const misses = report(rows, (r) => ({ events: Object.values(r.expected).map((w) => ({ id: w.event_id, durationMin: w.duration, constraint: parseExpected(w.constraint) })) }));
  for (const m of misses.slice(0, 10)) console.log('MISS', JSON.stringify(m));
} else if (cmd === 'batches') {
  const size = Number(args[0]) || 50;
  const dir = join(HERE, 'nemotron', 'runs');
  mkdirSync(dir, { recursive: true });
  // Plain text, one user turn per line: a whole conversation on one JSON line
  // is too long for some readers' file tools to show in full.
  for (let i = 0; i * size < rows.length; i++) {
    const part = rows.slice(i * size, (i + 1) * size).map(
      (r) => `=== TASK ${r.id} ===\n` + r.turns.filter((t) => t.role === 'user').map((t, j) => `${j + 1}. ${t.text.replace(/\s+/g, ' ').trim()}`).join('\n'),
    );
    writeFileSync(join(dir, `b${String(i + 1).padStart(2, '0')}-tasks.txt`), part.join('\n\n') + '\n');
  }
  console.log(`wrote ${Math.ceil(rows.length / size)} batches of ${size} to ${dir}`);
} else if (cmd === 'score') {
  const byId = new Map(args.flatMap(load).map((x) => [x.id, x]));
  const scored = rows.filter((r) => byId.has(r.id));
  const misses = report(scored, (r) => byId.get(r.id));
  for (const m of misses) console.log('MISS', JSON.stringify(m));
} else {
  console.log('usage: oracle | batches <size> | score <file.jsonl>...');
}
