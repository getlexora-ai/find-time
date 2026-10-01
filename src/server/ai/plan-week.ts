/**
 * Plan a backlog of tasks onto the calendar — "plan my week".
 *
 * `rankFreeSlots` answers one request; this places many against each other.
 * It is the same filter-then-score search, run once per session in a fixed
 * order, with every placement becoming busy time for the next. The shape
 * follows docs/planning-agent-plan.md §8, and each choice below closes one of
 * the traps in docs/fluidcalendar-lessons.md (numbers in brackets):
 *
 *   1. Blocks already on the calendar for a task stay where they are unless
 *      they have to move — a re-plan that reshuffles the week on every change
 *      is one nobody can rely on [15]. Blocks in the past are history: a
 *      missed session does not count as work done, so its time returns to the
 *      backlog instead of sitting in the past forever [17].
 *   2. Order: earliest deadline first, then priority, then least slack [5].
 *      EDF is the order that fits everything whenever anything can.
 *   3. A deadline is a hard bound on the search, never a score: nothing is
 *      ever placed after it [1]. `dueByISO` is already "end of the due day"
 *      on the user's calendar [2]. Inside the bound, sooner scores higher.
 *   4. Long tasks marked splittable go in sessions, one a day where possible.
 *   5. Whatever does not fit is returned with the reason and what would help —
 *      never dropped silently [9].
 *
 * Pure: no DB, no clock. The route supplies busy time already filtered by
 * `blocksTime`, and `verifyPlan` checks any result against the hard rules
 * independently of how it was built.
 */
import { dayWindowFor } from './clarify.ts';
import { type Busy, type RankedSlot, rankFreeSlots } from './find-time.ts';
import { type AgentProfile, effectiveBuffer } from './preferences.ts';
import type { SlotFeatures } from './scoring.ts';

const MIN = 60_000;
const DAY = 86_400_000;

/** A task with no due date is planned inside this many days. */
export const OPEN_HORIZON_DAYS = 14;
/** No search runs further out than this, however far away the deadline. */
export const MAX_HORIZON_DAYS = 56;
/** A splittable task is placed in sessions no longer than this. */
export const MAX_SESSION_MIN = 120;
/** How much finishing before `preferBy` is worth, on the 0–1 score scale. */
const PREFER_BY_BONUS = 0.1;

export type Priority = 'low' | 'medium' | 'high';
export type PreferredWindow = 'morning' | 'afternoon' | 'evening';

export type PlanTask = {
  id: string;
  title: string;
  /** scheduling category (deep-work, admin, …) — picks the day window and learned habits */
  category: string;
  /** time still needed, in minutes */
  durationMin: number;
  /** exclusive instant: nothing may end after it. Midnight after the due day. */
  dueByISO?: string | null;
  /** soft target: sessions finishing before it score a little higher */
  preferByISO?: string | null;
  priority: Priority;
  preferredWindow?: PreferredWindow | null;
  splittable: boolean;
  minChunkMin: number;
};

/** A block already on the calendar for one of the tasks. */
export type ExistingBlock = {
  eventId: string;
  taskId: string;
  startISO: string;
  endISO: string;
  /** the user fixed it in place: it stays even if something now overlaps it */
  pinned: boolean;
};

export type PlannedBlock = {
  taskId: string;
  title: string;
  category: string;
  startISO: string;
  endISO: string;
  /** 'new' is a proposal; 'kept' and 'pinned' are already on the calendar */
  status: 'new' | 'kept' | 'pinned';
  /** set on blocks the existing calendar already has */
  eventId?: string;
  /** set on a new block that takes the place of an existing one that had to move */
  replacesEventId?: string;
  score: number;
  features?: SlotFeatures;
  reason: string;
};

export type Unplaced = {
  taskId: string;
  title: string;
  /** minutes still without a slot */
  neededMin: number;
  /** minutes of this task that did get placed (including kept blocks) */
  placedMin: number;
  reason: string;
  /** what would make it fit, in words the user can say back */
  options: string[];
};

export type WeekPlan = {
  blocks: PlannedBlock[];
  unplaced: Unplaced[];
  /** task ids in the order they were placed */
  order: string[];
  /** existing blocks that have to move (each has a replacement or is listed as unplaced) */
  moved: { eventId: string; taskId: string; why: string }[];
};

export type PlanInput = {
  nowISO: string;
  tasks: PlanTask[];
  /** busy time that is not one of these tasks' own blocks */
  busy: Busy[];
  existing: ExistingBlock[];
  profile: AgentProfile;
};

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

const WINDOWS: Record<PreferredWindow, { start: number; end: number }> = {
  morning: { start: 8, end: 12 },
  afternoon: { start: 12, end: 17 },
  evening: { start: 17, end: 21 },
};

type Iv = { s: number; e: number };

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, '.000Z');
const dayStart = (ms: number) => Math.floor(ms / DAY) * DAY;
const overlaps = (a: Iv, b: Iv) => a.s < b.e && a.e > b.s;
const isWeekend = (ms: number) => [0, 6].includes(new Date(ms).getUTCDay());

/** Work stays on weekdays; personal time may use the weekend. */
const skipsWeekends = (t: PlanTask) => t.category !== 'personal';

/** The last instant this task's work may end. */
export function latestFor(t: PlanTask, nowMs: number): number {
  const cap = nowMs + MAX_HORIZON_DAYS * DAY;
  const due = t.dueByISO ? Date.parse(t.dueByISO) : NaN;
  if (Number.isFinite(due)) return Math.min(due, cap);
  return Math.min(nowMs + OPEN_HORIZON_DAYS * DAY, cap);
}

/** Free minutes inside the task's day window between now and its bound. */
export function freeMinutes(t: PlanTask, profile: AgentProfile, busy: Iv[], nowMs: number): { total: number; longest: number } {
  const win = dayWindowFor(profile, t.category);
  const latest = latestFor(t, nowMs);
  let total = 0;
  let longest = 0;
  for (let d = dayStart(nowMs); d < latest; d += DAY) {
    if (skipsWeekends(t) && isWeekend(d)) continue;
    const lo = Math.max(nowMs, d + win.start * 60 * MIN);
    const hi = Math.min(latest, d + win.end * 60 * MIN);
    if (hi <= lo) continue;
    // Walk the day's busy intervals, measuring the gaps between them.
    const day = busy.filter((b) => b.e > lo && b.s < hi).sort((a, b) => a.s - b.s);
    let cur = lo;
    for (const b of day) {
      if (b.s > cur) {
        total += b.s - cur;
        longest = Math.max(longest, b.s - cur);
      }
      cur = Math.max(cur, b.e);
    }
    if (hi > cur) {
      total += hi - cur;
      longest = Math.max(longest, hi - cur);
    }
  }
  return { total: Math.round(total / MIN), longest: Math.round(longest / MIN) };
}

/**
 * The next session's length. Non-splittable tasks go in one piece. Splittable
 * ones take at most MAX_SESSION_MIN and never leave a remainder shorter than
 * the task's minimum chunk.
 */
export function sessionSize(left: number, t: PlanTask): number {
  if (!t.splittable || left <= MAX_SESSION_MIN) return left;
  const chunk = Math.max(15, t.minChunkMin);
  let size = MAX_SESSION_MIN;
  if (left - size > 0 && left - size < chunk) size = left - chunk;
  return Math.min(left, Math.max(chunk, size));
}

const hours = (min: number) => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
};

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** The due *day* for an exclusive end-of-day bound: midnight after Friday reads as Friday. */
export function dueLabel(dueByISO: string): string {
  const d = new Date(Date.parse(dueByISO) - 1);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

export function planWeek(input: PlanInput): WeekPlan {
  const nowMs = Date.parse(input.nowISO);
  const { profile } = input;
  const buf = effectiveBuffer(profile) * MIN;
  const tasks = new Map(input.tasks.map((t) => [t.id, t]));

  // Everything that already occupies time, as plain intervals.
  const busy: Iv[] = input.busy
    .map((b) => ({ s: Date.parse(b.start), e: Date.parse(b.end) }))
    .filter((b) => Number.isFinite(b.s) && Number.isFinite(b.e) && b.e > b.s);

  const blocks: PlannedBlock[] = [];
  const moved: WeekPlan['moved'] = [];
  const credited = new Map<string, number>();
  const daysUsed = new Map<string, Set<number>>();
  const replaceable = new Map<string, string[]>();
  const credit = (taskId: string, s: number, e: number) => {
    credited.set(taskId, (credited.get(taskId) ?? 0) + Math.round((e - s) / MIN));
    if (!daysUsed.has(taskId)) daysUsed.set(taskId, new Set());
    daysUsed.get(taskId)!.add(dayStart(s));
  };

  // ── 1. what is already on the calendar ──────────────────────────────────
  // Pinned first, so a kept block is checked against everything the user fixed.
  const existing = [...input.existing].sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(a.startISO) - Date.parse(b.startISO));
  for (const x of existing) {
    const t = tasks.get(x.taskId);
    const s = Date.parse(x.startISO);
    const e = Date.parse(x.endISO);
    if (!t || !Number.isFinite(s) || !Number.isFinite(e)) continue;
    // Past (or finished) sessions are history, not progress: the task's
    // duration is the time it still needs.
    if (e <= nowMs) continue;

    const iv = { s, e };
    let why: string | null = null;
    if (!x.pinned) {
      if (e > latestFor(t, nowMs) && t.dueByISO) why = `it ended after the ${dueLabel(t.dueByISO)} deadline`;
      else if (busy.some((b) => overlaps(b, iv))) why = 'something else is now booked at that time';
      else if ((credited.get(t.id) ?? 0) >= t.durationMin) why = 'the task no longer needs it';
    }
    if (why) {
      moved.push({ eventId: x.eventId, taskId: t.id, why });
      if (!replaceable.has(t.id)) replaceable.set(t.id, []);
      replaceable.get(t.id)!.push(x.eventId);
      continue;
    }
    blocks.push({
      taskId: t.id,
      title: t.title,
      category: t.category,
      startISO: x.startISO,
      endISO: x.endISO,
      status: x.pinned ? 'pinned' : 'kept',
      eventId: x.eventId,
      score: 0,
      reason: x.pinned ? 'you fixed this one in place' : 'already on your calendar',
    });
    busy.push({ s: s - buf, e: e + buf });
    credit(t.id, s, e);
  }

  // ── 2. order ────────────────────────────────────────────────────────────
  const remaining = (t: PlanTask) => Math.max(0, t.durationMin - (credited.get(t.id) ?? 0));
  const slack = new Map(input.tasks.map((t) => [t.id, freeMinutes(t, profile, busy, nowMs).total - remaining(t)]));
  const dueOf = (t: PlanTask) => (t.dueByISO ? Date.parse(t.dueByISO) : Infinity);
  const preferOf = (t: PlanTask) => (t.preferByISO ? Date.parse(t.preferByISO) : Infinity);
  const ordered = [...input.tasks].sort(
    (a, b) =>
      dueOf(a) - dueOf(b) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      (slack.get(a.id) ?? 0) - (slack.get(b.id) ?? 0) ||
      preferOf(a) - preferOf(b) ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
  );

  // ── 3. place ────────────────────────────────────────────────────────────
  const unplaced: Unplaced[] = [];
  const startISO = iso(Math.ceil(nowMs / (15 * MIN)) * 15 * MIN);

  const best = (t: PlanTask, size: number, avoidDays: Set<number> | null): RankedSlot | null => {
    const latest = latestFor(t, nowMs);
    if (latest <= nowMs) return null;
    const asBusy = busy.map((b) => ({ start: iso(b.s), end: iso(b.e) }));
    const win = dayWindowFor(profile, t.category);
    // The preferred part of the day first; the whole window if that is full.
    const windows = t.preferredWindow
      ? [
          {
            start: Math.max(win.start, WINDOWS[t.preferredWindow].start),
            end: Math.min(win.end, WINDOWS[t.preferredWindow].end),
          },
          win,
        ].filter((w) => w.end > w.start)
      : [win];
    const preferBy = t.preferByISO ? Date.parse(t.preferByISO) : NaN;
    for (const w of windows) {
      const ranked = rankFreeSlots(
        asBusy,
        {
          durationMin: size,
          count: 1,
          earliestISO: startISO,
          latestISO: iso(latest),
          dayStartHour: w.start,
          dayEndHour: w.end,
          bufferMin: 0,
          skipWeekends: skipsWeekends(t),
          category: t.category,
        },
        profile,
      )
        .filter((r) => !avoidDays || !avoidDays.has(dayStart(Date.parse(r.startISO))))
        .map((r) =>
          Number.isFinite(preferBy) && Date.parse(r.endISO) <= preferBy ? { ...r, score: r.score + PREFER_BY_BONUS } : r,
        )
        .sort((a, b) => b.score - a.score || Date.parse(a.startISO) - Date.parse(b.startISO));
      if (ranked.length) return ranked[0];
    }
    return null;
  };

  for (const t of ordered) {
    let left = remaining(t);
    if (left <= 0) continue;

    if (t.dueByISO && Date.parse(t.dueByISO) <= nowMs) {
      unplaced.push({
        taskId: t.id,
        title: t.title,
        neededMin: left,
        placedMin: credited.get(t.id) ?? 0,
        reason: `it was due ${dueLabel(t.dueByISO)}, which has passed`,
        options: [`${t.title} due next week`, `done with ${t.title}`],
      });
      continue;
    }

    const need = left;
    // Measured before this task takes anything, so a partial fit can say what was free.
    const freeBefore = freeMinutes(t, profile, busy, nowMs);
    const used = daysUsed.get(t.id) ?? new Set<number>();
    const replaces = replaceable.get(t.id) ?? [];
    let lastSize = 0;
    while (left > 0) {
      let size = sessionSize(left, t);
      // One session a day where the week allows it; doubling up only when it doesn't.
      let slot = best(t, size, t.splittable ? used : null) ?? (t.splittable ? best(t, size, null) : null);
      // A splittable task shrinks its session before giving up on it.
      while (!slot && t.splittable && size - 15 >= Math.max(15, t.minChunkMin)) {
        size -= 15;
        slot = best(t, size, used) ?? best(t, size, null);
      }
      if (!slot) {
        lastSize = size;
        break;
      }
      const s = Date.parse(slot.startISO);
      const e = Date.parse(slot.endISO);
      blocks.push({
        taskId: t.id,
        title: t.title,
        category: t.category,
        startISO: slot.startISO,
        endISO: slot.endISO,
        status: 'new',
        ...(replaces.length ? { replacesEventId: replaces.shift()! } : {}),
        score: slot.score,
        features: slot.features,
        reason: slot.reason,
      });
      busy.push({ s: s - buf, e: e + buf });
      used.add(dayStart(s));
      credited.set(t.id, (credited.get(t.id) ?? 0) + size);
      left -= size;
    }

    if (left > 0) unplaced.push(explainMiss(t, { need, left, size: lastSize, placedMin: credited.get(t.id) ?? 0, free: freeBefore }));
  }

  blocks.sort((a, b) => Date.parse(a.startISO) - Date.parse(b.startISO));
  return { blocks, unplaced, order: ordered.map((t) => t.id), moved };
}

/** Why a task did not fit, against the time that was free when its turn came. */
function explainMiss(
  t: PlanTask,
  m: { need: number; left: number; size: number; placedMin: number; free: { total: number; longest: number } },
): Unplaced {
  const by = t.dueByISO ? `before ${dueLabel(t.dueByISO)}` : `in the next ${OPEN_HORIZON_DAYS} days`;
  const got = m.need - m.left;
  const partial = got > 0 ? ` — I placed ${hours(got)}, ${hours(m.left)} still has no slot` : '';
  const options: string[] = [];
  let reason: string;
  if (m.free.total < m.need) {
    reason = `it needs ${hours(m.need)} ${by} and only ${hours(m.free.total)} is free${partial}`;
    if (t.dueByISO) options.push(`${t.title} due next week`);
    // Shortened to what would fit: what was already booked plus what was free.
    const kept = m.placedMin - got;
    const fits = Math.floor((kept + m.free.total) / 15) * 15;
    if (fits >= 15 && fits < t.durationMin) options.push(`${t.title} takes ${hours(fits)}`);
  } else {
    reason = `there's no single free stretch of ${hours(m.size || m.left)} ${by}${partial}`;
    if (!t.splittable) options.push(`split ${t.title}`);
    if (t.dueByISO) options.push(`${t.title} due next week`);
  }
  return { taskId: t.id, title: t.title, neededMin: m.left, placedMin: m.placedMin, reason, options };
}

/**
 * Check a plan against the hard rules, independently of how it was built.
 * Returns the problems found; an empty list is a valid plan.
 */
export function verifyPlan(input: PlanInput, plan: WeekPlan): string[] {
  const nowMs = Date.parse(input.nowISO);
  const tasks = new Map(input.tasks.map((t) => [t.id, t]));
  const problems: string[] = [];
  const busy = input.busy.map((b) => ({ s: Date.parse(b.start), e: Date.parse(b.end) }));
  const placed: (Iv & { label: string; status: PlannedBlock['status'] })[] = [];
  const minutes = new Map<string, { kept: number; added: number }>();

  for (const b of plan.blocks) {
    const t = tasks.get(b.taskId);
    const iv = { s: Date.parse(b.startISO), e: Date.parse(b.endISO) };
    const label = `${b.title} ${b.startISO}`;
    if (!t) {
      problems.push(`${label}: unknown task`);
      continue;
    }
    if (!(iv.e > iv.s)) problems.push(`${label}: empty or inverted`);
    if (b.status === 'new') {
      if (iv.s < nowMs) problems.push(`${label}: starts in the past`);
      if (t.dueByISO && iv.e > Date.parse(t.dueByISO)) problems.push(`${label}: ends after the deadline`);
      if (busy.some((x) => overlaps(x, iv))) problems.push(`${label}: overlaps busy time`);
      const win = dayWindowFor(input.profile, t.category);
      const from = (iv.s - dayStart(iv.s)) / (60 * MIN);
      const to = from + (iv.e - iv.s) / (60 * MIN);
      if (from < win.start || to > win.end) problems.push(`${label}: outside the day window`);
      if (skipsWeekends(t) && isWeekend(iv.s)) problems.push(`${label}: on a weekend`);
    }
    for (const p of placed) {
      if (overlaps(p, iv) && (b.status === 'new' || p.status === 'new')) problems.push(`${label}: overlaps ${p.label}`);
    }
    placed.push({ ...iv, label, status: b.status });
    const m = minutes.get(t.id) ?? { kept: 0, added: 0 };
    m[b.status === 'new' ? 'added' : 'kept'] += Math.round((iv.e - iv.s) / MIN);
    minutes.set(t.id, m);
  }
  // New sessions only ever top a task up to what it needs; kept ones may exceed it.
  for (const [id, m] of minutes) {
    const t = tasks.get(id)!;
    if (m.added > 0 && m.kept + m.added > t.durationMin) {
      problems.push(`${t.title}: ${m.kept + m.added} min placed for a ${t.durationMin}-min task`);
    }
  }
  return problems;
}
