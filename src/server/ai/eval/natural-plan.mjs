/**
 * NATURAL PLAN calendar scheduling (google-deepmind/natural-plan, Apache-2.0;
 * via tuandunghcmut/natural-plan-benchmark on Hugging Face) run the Find time
 * way: a reader turns the sentence into constraints, `findFreeSlots` places.
 *
 * The reader is whatever produced the extraction file — a model (any vendor,
 * see extract-prompt.md) or the template parser here (`oracle`, which shows the
 * solver is right when the reading is). The solver never changes per model.
 *
 *   node src/server/ai/eval/natural-plan.mjs oracle
 *   node src/server/ai/eval/natural-plan.mjs sample <perGroup> <out.jsonl> [single|multi] [offset]
 *   node src/server/ai/eval/natural-plan.mjs score <extractions.jsonl>
 *
 * Extraction (one JSON object per line):
 *   { "id": "...", "durationMin": 30, "days": ["Monday", ...],
 *     "busy": [["Monday", "9:00", "10:30"], ...],
 *     "avoid": [["Monday"], ["Tuesday", "after", "15:00"], ...] }
 * `busy` holds every participant's blocked time as written. `avoid` holds each
 * preference copied as written (day, and "before"/"after" + time if given);
 * code turns it into blocked time, so no model has to work out which side of
 * 15:00 "after 15:00" blocks. (Files that put preferences straight into
 * `busy` still score.)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findFreeSlots } from '../find-time.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, 'natural-plan', 'calendar.jsonl');
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
/** Monday of an arbitrary week; only the weekday matters. */
const WEEK = Date.UTC(2026, 9, 5);
const DAY_MS = 86_400_000;
const WORK = { start: 9, end: 17 };

const load = (path) => readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const hours = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h + (m || 0) / 60;
};
const at = (day, hhmm) => new Date(WEEK + DAYS.indexOf(day) * DAY_MS + hours(hhmm) * 3_600_000).toISOString();

/** The earliest slot on the allowed days, in weekday order. */
/** A preference as blocked time: all day, or the part of the work day before/after a time. */
const avoidSpan = ([day, side, time]) =>
  side === 'before' ? [day, `${WORK.start}:00`, time] : side === 'after' ? [day, time, `${WORK.end}:00`] : [day, `${WORK.start}:00`, `${WORK.end}:00`];

export function solve(x) {
  if (!x || !Number.isFinite(x.durationMin) || !Array.isArray(x.days) || !Array.isArray(x.busy)) return null;
  const spans = [...x.busy, ...(Array.isArray(x.avoid) ? x.avoid.map(avoidSpan) : [])];
  const busy = spans.filter((b) => DAYS.includes(b[0])).map(([d, s, e]) => ({ start: at(d, s), end: at(d, e) }));
  for (const day of DAYS.filter((d) => x.days.includes(d))) {
    const dayMs = WEEK + DAYS.indexOf(day) * DAY_MS;
    const [slot] = findFreeSlots(busy, {
      durationMin: x.durationMin,
      count: 1,
      earliestISO: new Date(dayMs).toISOString(),
      latestISO: new Date(dayMs + DAY_MS).toISOString(),
      dayStartHour: WORK.start,
      dayEndHour: WORK.end,
      bufferMin: 0,
    });
    if (slot) {
      const h = (iso) => (Date.parse(iso) - dayMs) / 3_600_000;
      return { day, start: h(slot.startISO), end: h(slot.endISO) };
    }
  }
  return null;
}

// ── the template reader (an oracle for the solver, not a model stand-in) ──

const T = '(\\d{1,2}:\\d{2})';
const DAY_RX = DAYS.join('|');

export function oracle(task) {
  const durationMin = /for one hour/.test(task) ? 60 : /for half an hour/.test(task) ? 30 : NaN;
  const daysPart = /work hours of [\d:]+ to [\d:]+ on (?:either )?([^.]*)\./.exec(task)?.[1] ?? '';
  const days = DAYS.filter((d) => daysPart.includes(d));
  const busy = [];

  // "X has meetings on Monday during 9:00 to 9:30, 11:00 to 12:00, Tuesday during …;"
  for (const m of task.matchAll(/(?:has meetings|has blocked their calendar|is busy) on (.*?);/g)) {
    let day = null;
    for (const tok of m[1].matchAll(new RegExp(`(${DAY_RX}) during|${T} to ${T}`, 'g'))) {
      if (tok[1]) day = tok[1];
      else if (day) busy.push([day, tok[2], tok[3]]);
    }
  }

  // Preferences, read as blocked time. A sentence may run on: "… on Monday. Tuesday before 14:30."
  const tail = task.slice(task.lastIndexOf(';') + 1);
  const PREF = `(?:would like to avoid more meetings|would rather not meet|do not want to meet|can not meet) on (${DAY_RX})(?: (before|after) ${T})?\\.((?:\\s+(?:${DAY_RX})(?: (?:before|after) ${T})?\\.)*)`;
  const avoid = [];
  const block = (day, side, time) => avoid.push(side ? [day, side, time] : [day]);
  for (const m of tail.matchAll(new RegExp(PREF, 'g'))) {
    block(m[1], m[2], m[3]);
    for (const more of (m[4] ?? '').matchAll(new RegExp(`(${DAY_RX})(?: (before|after) ${T})?\\.`, 'g'))) block(more[1], more[2], more[3]);
  }
  return { durationMin, days, busy, avoid };
}

// ── scoring ──

const same = (a, b) => a && b && a.day === b.day && Math.abs(a.start - b.start) < 1e-6 && Math.abs(a.end - b.end) < 1e-6;
const group = (r) => (r.days === 1 ? 'single-day' : 'multi-day');

/** A slot that breaks none of the task's constraints, judged by the template reading. */
function valid(slot, task) {
  if (!slot) return false;
  const o = oracle(task);
  if (!o.days.includes(slot.day) || slot.start < WORK.start || slot.end > WORK.end) return false;
  if (Math.abs(slot.end - slot.start - o.durationMin / 60) > 1e-6) return false;
  return ![...o.busy, ...o.avoid.map(avoidSpan)].some(([d, s, e]) => d === slot.day && slot.start < hours(e) && slot.end > hours(s));
}

/**
 * Correct = what the task asks for. "Earliest availability" has one answer, so
 * it must match the golden one. Otherwise several slots can work and the
 * dataset lists one of them, so any slot that breaks no constraint is correct.
 * `exact` is the benchmark's own metric (golden match only), for comparison.
 */
function report(rows, answer) {
  const tally = {};
  const misses = [];
  for (const r of rows) {
    const keys = [group(r), `${r.days}-day`, 'all'];
    for (const k of keys) tally[k] ??= { n: 0, ok: 0, exact: 0 };
    const got = answer(r);
    const exact = same(got, r.golden);
    const ok = /earlist availability|earliest availability/.test(r.task) ? exact : valid(got, r.task);
    for (const k of keys) {
      tally[k].n++;
      if (ok) tally[k].ok++;
      if (exact) tally[k].exact++;
    }
    if (!ok) misses.push({ id: r.id, golden: r.golden, got });
  }
  console.log('group        correct          exact (benchmark)');
  for (const k of ['single-day', 'multi-day', '1-day', '2-day', '3-day', '4-day', '5-day', 'all']) {
    const t = tally[k];
    if (t) console.log(`${k.padEnd(11)} ${String(t.ok).padStart(4)}/${String(t.n).padEnd(4)} ${((100 * t.ok) / t.n).toFixed(1).padStart(5)}%   ${((100 * t.exact) / t.n).toFixed(1).padStart(5)}%`);
  }
  return misses;
}

const [cmd, ...args] = process.argv.slice(2);
const rows = load(DATA);

if (cmd === 'oracle') {
  const misses = report(rows, (r) => solve(oracle(r.task)));
  for (const m of misses.slice(0, 10)) console.log('MISS', JSON.stringify(m));
  // The validity check must accept every golden answer, or it is stricter than the task.
  const rejected = rows.filter((r) => !valid(r.golden, r.task)).map((r) => r.id);
  console.log(`golden answers the validity check accepts: ${rows.length - rejected.length}/${rows.length}`, rejected.slice(0, 5));
} else if (cmd === 'sample') {
  // Deterministic, stratified: every k-th row of each day-count, so reruns compare like with like.
  const per = Number(args[0]) || 25;
  const only = args[2];
  // A different offset gives a disjoint held-out set (offset < step).
  const offset = Number(args[3]) || 0;
  const picked = [];
  for (const d of [1, 2, 3, 4, 5]) {
    if (only === 'single' && d !== 1) continue;
    if (only === 'multi' && d === 1) continue;
    const pool = rows.filter((r) => r.days === d);
    const n = d === 1 ? per : Math.ceil(per / 4);
    const step = Math.floor(pool.length / n);
    for (let i = 0; i < n; i++) picked.push(pool[i * step + offset]);
  }
  writeFileSync(args[1], picked.map((r) => JSON.stringify({ id: r.id, task: r.task })).join('\n') + '\n');
  console.log(`wrote ${picked.length} tasks to ${args[1]}`);
} else if (cmd === 'score') {
  const byId = new Map(load(args[0]).map((x) => [x.id, x]));
  const scored = rows.filter((r) => byId.has(r.id));
  const misses = report(scored, (r) => solve(byId.get(r.id)));
  // Where a model miss came from: its reading differs from the template reading.
  for (const m of misses) {
    const x = byId.get(m.id);
    const o = oracle(rows.find((r) => r.id === m.id).task);
    const key = (b) => b.join(' ');
    const xs = [...(x.busy ?? []), ...(x.avoid ?? []).map(avoidSpan)].map(key);
    const os = [...o.busy, ...o.avoid.map(avoidSpan)].map(key);
    const extra = xs.filter((b) => !os.includes(b));
    const missing = os.filter((b) => !xs.includes(b));
    console.log('MISS', m.id, JSON.stringify({ golden: m.golden, got: m.got, durationMin: [x.durationMin, o.durationMin], days: x.days?.join(',') === o.days.join(',') ? 'ok' : [x.days, o.days], extra, missing }));
  }
} else {
  console.log('usage: oracle | sample <perGroup> <out.jsonl> [single|multi] [offset] | score <extractions.jsonl>');
}
