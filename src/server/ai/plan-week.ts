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
 * Around the tasks (§8 steps 1–2):
 *
 *   - Time away is hard busy time, and a miss it caused says so.
 *   - Travel is the caller's: `travelPadding` turns in-person events into the
 *     busy time either side of them, and the route adds it to `busy`.
 *   - Habits ("gym 3× a week") are placed before tasks, per calendar week
 *     (Monday–Sunday): this week, and next week too from Friday on. Sessions
 *     already in the week count toward the target — past ones included, since a
 *     habit is a rhythm, not a backlog — and new ones spread out, one a day,
 *     avoiding the day either side of another session where the week allows.
 *   - A task's `notBeforeISO` (a start date, or a postpone [12]) is a hard
 *     lower bound, like the deadline is an upper one. A block before it moves,
 *     pinned or not: the postpone is the newer instruction.
 *
 * From the model of personalized-schedule-optimizer-benchmark (its solvers
 * were measured against this and not adopted — docs/planning-agent-plan.md §8):
 *
 *   - Effort against a daily budget: a minute of hard work counts 1.5, light
 *     0.5, against `maxDailyFocusMin`. A slot inside the budget always beats
 *     one over it; going over is only for what can't fit otherwise.
 *   - Hard tasks spread across the week or cluster (`profile.hardWork`), and
 *     demanding work leans to the lighter day.
 *   - Order: habit minimums → tasks (EDF) → priority bumps → habit extras →
 *     optional tasks (low priority, no deadline). A task that missed may take
 *     the new sessions of a lower-priority one, kept only if it then fits whole.
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
/** How much a habit session loses for sitting the day before or after another one. */
const HABIT_ADJACENT_PENALTY = 0.15;
/** How much a slot loses as its day fills toward the daily budget (0–1 scale, at a full day). */
const LOAD_BALANCE_WEIGHT = 0.1;
/** Hard tasks: how much a day that already has one is worth (cluster) or costs (spread). */
const HARD_STRATEGY_WEIGHT = 0.1;
/** At most this many lower-priority tasks are tried when making room for a higher one. */
const MAX_BUMP_TRIES = 5;

/**
 * How much of the daily budget (`maxDailyFocusMin`) a minute of a task uses.
 * After the benchmark's difficulty capacity (personalized-schedule-optimizer-benchmark):
 * three hours of hard work fill a four-hour day; easy admin barely touches it.
 */
export const EFFORT_WEIGHT: Record<Effort, number> = { light: 0.5, normal: 1, hard: 1.5 };

export type Effort = 'light' | 'normal' | 'hard';

/** Low priority and no deadline: placed after everything else, and the first to give way. */
export const isOptional = (t: PlanTask) => t.priority === 'low' && !t.dueByISO;

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
  /** inclusive instant: nothing may start before it ("not before", a postpone) */
  notBeforeISO?: string | null;
  priority: Priority;
  /** how draining it is — counts against the day's budget (default 'normal') */
  effort?: Effort;
  preferredWindow?: PreferredWindow | null;
  splittable: boolean;
  minChunkMin: number;
};

/** A weekly rhythm — "gym 3× a week, an hour, mornings". */
export type PlanHabit = {
  id: string;
  title: string;
  category: string;
  durationMin: number;
  /** sessions wanted per calendar week, 1–7 — the ideal */
  perWeek: number;
  /** the fewest that still count ("at least 2, ideally 3"); placed before tasks. Default: perWeek */
  minPerWeek?: number | null;
  preferredWindow?: PreferredWindow | null;
};

/** A block already on the calendar for one of the tasks or habits. */
export type ExistingBlock = {
  eventId: string;
  /** exactly one of taskId / habitId */
  taskId?: string;
  habitId?: string;
  startISO: string;
  endISO: string;
  /** the user fixed it in place (or moved it there): it stays even if something now overlaps it */
  pinned: boolean;
};

export type PlannedBlock = {
  /** exactly one of taskId / habitId */
  taskId?: string;
  habitId?: string;
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
  /** exactly one of taskId / habitId */
  taskId?: string;
  habitId?: string;
  title: string;
  /** minutes still without a slot */
  neededMin: number;
  /** minutes of this task that did get placed (including kept blocks) */
  placedMin: number;
  reason: string;
  /** what would make it fit, in words the user can say back */
  options: string[];
  /** a low-priority task with no deadline, left out because the week was full */
  optional?: boolean;
};

export type WeekPlan = {
  blocks: PlannedBlock[];
  unplaced: Unplaced[];
  /** task ids in the order they were placed */
  order: string[];
  /** existing blocks that have to move (each has a replacement or is listed as unplaced) */
  moved: { eventId: string; taskId?: string; habitId?: string; why: string }[];
  /** soft shortfalls worth saying: a habit at its minimum but under its ideal */
  notes: string[];
};

export type PlanInput = {
  nowISO: string;
  tasks: PlanTask[];
  habits?: PlanHabit[];
  /** busy time that is not one of these tasks' or habits' own blocks (travel included) */
  busy: Busy[];
  /** time away — busy, and named as the reason when it is why something missed */
  away?: Busy[];
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
const skipsWeekends = (t: { category: string }) => t.category !== 'personal';

/** The last instant this task's work may end. */
export function latestFor(t: PlanTask, nowMs: number): number {
  const cap = nowMs + MAX_HORIZON_DAYS * DAY;
  const due = t.dueByISO ? Date.parse(t.dueByISO) : NaN;
  if (Number.isFinite(due)) return Math.min(due, cap);
  return Math.min(nowMs + OPEN_HORIZON_DAYS * DAY, cap);
}

/** The first instant this task's work may start: now, or its not-before if later. */
export function earliestFor(t: PlanTask, nowMs: number): number {
  const nb = t.notBeforeISO ? Date.parse(t.notBeforeISO) : NaN;
  return Number.isFinite(nb) ? Math.max(nowMs, nb) : nowMs;
}

/** Free minutes inside the task's day window between its earliest start and its bound. */
export function freeMinutes(t: PlanTask, profile: AgentProfile, busy: Iv[], nowMs: number): { total: number; longest: number } {
  const win = dayWindowFor(profile, t.category);
  const earliest = earliestFor(t, nowMs);
  const latest = latestFor(t, nowMs);
  let total = 0;
  let longest = 0;
  for (let d = dayStart(earliest); d < latest; d += DAY) {
    if (skipsWeekends(t) && isWeekend(d)) continue;
    const lo = Math.max(earliest, d + win.start * 60 * MIN);
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

/** Words in a location that mean nobody has to go anywhere. */
const ONLINE = /\b(?:zoom|google\s*meet|meet\.google|teams|webex|skype|whereby|online|virtual|remote|call|phone|https?:\/\/)/i;

export type TravelCandidate = {
  start: string;
  end: string;
  location?: string | null;
  videoUrl?: string | null;
  allDay?: boolean;
};

/**
 * Travel time as busy time: `travelMin` before and after every in-person
 * event — one with a location that isn't a video call. Off at 0. Only the
 * events that already block time should be passed in (`blocksTime`).
 */
export function travelPadding(events: TravelCandidate[], travelMin: number): Busy[] {
  if (!(travelMin > 0)) return [];
  const pad = travelMin * MIN;
  const out: Busy[] = [];
  for (const e of events) {
    const where = (e.location ?? '').trim();
    if (!where || e.allDay || e.videoUrl || ONLINE.test(where)) continue;
    const s = Date.parse(e.start);
    const en = Date.parse(e.end);
    if (!Number.isFinite(s) || !Number.isFinite(en)) continue;
    out.push({ start: iso(s - pad), end: iso(s) }, { start: iso(en), end: iso(en + pad) });
  }
  return out;
}

/** Monday 00:00 of the week `ms` falls in (wall-clock, like every time here). */
export const weekStart = (ms: number) => {
  const d = dayStart(ms);
  return d - ((new Date(d).getUTCDay() + 6) % 7) * DAY;
};

/** The weeks habits are planned for: this one, and next one from Friday on. */
export function habitWeeks(nowMs: number): number[] {
  const w = weekStart(nowMs);
  return dayStart(nowMs) - w >= 4 * DAY ? [w, w + 7 * DAY] : [w];
}

const spanLabel = (s: number, e: number) => {
  const a = startLabel(dayStart(s));
  const b = dueLabel(iso(e));
  return a === b ? a : `${a} – ${b}`;
};

/** The day an instant falls on, with its time unless it is midnight: "Mon 14 Sep", "Wed 9 Sep 13:30". */
export function startLabel(ms: number): string {
  const d = new Date(ms);
  const day = `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
  return ms % DAY ? `${day} ${d.toISOString().slice(11, 16)}` : day;
}

export function planWeek(input: PlanInput): WeekPlan {
  const nowMs = Date.parse(input.nowISO);
  const { profile } = input;
  const buf = effectiveBuffer(profile) * MIN;
  const tasks = new Map(input.tasks.map((t) => [t.id, t]));
  const habits = new Map((input.habits ?? []).map((h) => [h.id, h]));
  /** the day's budget of demanding work, in effort-weighted minutes */
  const cap = Math.max(60, profile.maxDailyFocusMin);
  const strategy = profile.hardWork ?? 'spread';

  const toIv = (b: Busy) => ({ s: Date.parse(b.start), e: Date.parse(b.end) });
  const valid = (b: Iv) => Number.isFinite(b.s) && Number.isFinite(b.e) && b.e > b.s;
  const away: Iv[] = (input.away ?? []).map(toIv).filter(valid);

  /** " (you're away Tue 6 Oct – Thu 8 Oct)" when time away falls inside [lo, hi). */
  const awayNote = (lo: number, hi: number) => {
    const hit = away.filter((a) => a.e > lo && a.s < hi);
    if (!hit.length) return '';
    return ` (you're away ${spanLabel(Math.min(...hit.map((a) => a.s)), Math.max(...hit.map((a) => a.e)))})`;
  };

  // ── state ───────────────────────────────────────────────────────────────
  // Everything placed goes through occupy/release, so a step can be undone
  // (the priority bump tries a change and takes it back if it doesn't help).
  type Held = Iv & { ref?: PlannedBlock };
  let busy: Held[] = [...input.busy.map(toIv).filter(valid), ...away];
  let blocks: PlannedBlock[] = [];
  let credited = new Map<string, number>();
  /** task id, or "h:" + habit id → day → sessions that day (past habit sessions included) */
  let perDay = new Map<string, Map<number, number>>();
  /** day → effort-weighted minutes of demanding work */
  let load = new Map<number, number>();
  /** day → minutes of hard tasks */
  let hardLoad = new Map<number, number>();
  /** task id, or "h:<habit>:<week>" → existing blocks a new one may take the place of */
  let replaceable = new Map<string, string[]>();
  const moved: WeekPlan['moved'] = [];

  const keyOf = (b: { taskId?: string; habitId?: string }) => b.taskId ?? `h:${b.habitId}`;
  const weightOf = (b: { taskId?: string; habitId?: string }) => {
    if (b.taskId) return EFFORT_WEIGHT[tasks.get(b.taskId)?.effort ?? 'normal'];
    // The gym is not a draw on the same budget as a hard report.
    return habits.get(b.habitId!)?.category === 'personal' ? 0 : 1;
  };
  const isHard = (b: { taskId?: string }) => !!b.taskId && tasks.get(b.taskId)?.effort === 'hard';
  const bump = (m: Map<number, number>, d: number, by: number) => m.set(d, (m.get(d) ?? 0) + by);
  const countDay = (key: string, d: number, by: number) => {
    if (!perDay.has(key)) perDay.set(key, new Map());
    bump(perDay.get(key)!, d, by);
  };
  const daysOf = (key: string) => new Set([...(perDay.get(key) ?? new Map<number, number>())].filter(([, n]) => n > 0).map(([d]) => d));
  /** days in week `w` holding a session of habit `id` */
  const habitDays = (id: string, w: number) => new Set([...daysOf(`h:${id}`)].filter((d) => weekStart(d) === w));
  const replaceKey = (b: { taskId?: string; habitId?: string }, s: number) => b.taskId ?? `h:${b.habitId}:${weekStart(s)}`;
  const markReplaceable = (key: string, eventId: string) => {
    if (!replaceable.has(key)) replaceable.set(key, []);
    replaceable.get(key)!.push(eventId);
  };

  const occupy = (b: PlannedBlock) => {
    const s = Date.parse(b.startISO);
    const e = Date.parse(b.endISO);
    const d = dayStart(s);
    const min = Math.round((e - s) / MIN);
    blocks.push(b);
    busy.push({ s: s - buf, e: e + buf, ref: b });
    countDay(keyOf(b), d, 1);
    bump(load, d, min * weightOf(b));
    if (isHard(b)) bump(hardLoad, d, min);
    if (b.taskId) credited.set(b.taskId, (credited.get(b.taskId) ?? 0) + min);
  };
  const release = (b: PlannedBlock) => {
    const s = Date.parse(b.startISO);
    const e = Date.parse(b.endISO);
    const d = dayStart(s);
    const min = Math.round((e - s) / MIN);
    blocks = blocks.filter((x) => x !== b);
    busy = busy.filter((x) => x.ref !== b);
    countDay(keyOf(b), d, -1);
    bump(load, d, -min * weightOf(b));
    if (isHard(b)) bump(hardLoad, d, -min);
    if (b.taskId) credited.set(b.taskId, (credited.get(b.taskId) ?? 0) - min);
    if (b.replacesEventId) {
      const k = replaceKey(b, s);
      replaceable.set(k, [b.replacesEventId, ...(replaceable.get(k) ?? [])]);
    }
  };
  const snapshot = () => ({
    busy: [...busy],
    blocks: [...blocks],
    credited: new Map(credited),
    perDay: new Map([...perDay].map(([k, m]) => [k, new Map(m)])),
    load: new Map(load),
    hardLoad: new Map(hardLoad),
    replaceable: new Map([...replaceable].map(([k, a]) => [k, [...a]])),
  });
  const restore = (x: ReturnType<typeof snapshot>) => {
    ({ busy, blocks, credited, perDay, load, hardLoad, replaceable } = x);
  };

  // ── 1. what is already on the calendar ──────────────────────────────────
  // Pinned first, so a kept block is checked against everything the user fixed.
  const existing = [...input.existing].sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(a.startISO) - Date.parse(b.startISO));
  for (const x of existing) {
    const s = Date.parse(x.startISO);
    const e = Date.parse(x.endISO);
    if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
    const iv = { s, e };
    const keptFields = {
      startISO: x.startISO,
      endISO: x.endISO,
      status: x.pinned ? ('pinned' as const) : ('kept' as const),
      eventId: x.eventId,
      score: 0,
      reason: x.pinned ? 'you fixed this one in place' : 'already on your calendar',
    };

    if (x.habitId) {
      const h = habits.get(x.habitId);
      if (!h) continue;
      const days = habitDays(h.id, weekStart(s));
      // A habit is a rhythm: this week's past sessions still count toward it.
      if (e <= nowMs) {
        countDay(`h:${h.id}`, dayStart(s), 1);
        continue;
      }
      let why: string | null = null;
      if (!x.pinned) {
        if (away.some((a) => overlaps(a, iv))) why = "you're away then";
        else if (busy.some((b) => overlaps(b, iv))) why = 'something else is now booked at that time';
        else if (days.size >= h.perWeek) why = `the week already has ${h.perWeek} ${h.title} session${h.perWeek === 1 ? '' : 's'}`;
        else if (days.has(dayStart(s))) why = `there's already a ${h.title} session that day`;
      }
      if (why) {
        moved.push({ eventId: x.eventId, habitId: h.id, why });
        markReplaceable(`h:${h.id}:${weekStart(s)}`, x.eventId);
        continue;
      }
      occupy({ habitId: h.id, title: h.title, category: h.category, ...keptFields });
      continue;
    }

    const t = x.taskId ? tasks.get(x.taskId) : undefined;
    if (!t) continue;
    // Past (or finished) sessions are history, not progress: the task's
    // duration is the time it still needs.
    if (e <= nowMs) continue;

    let why: string | null = null;
    // A postpone is newer than any pin, so it moves pinned blocks too.
    if (s < earliestFor(t, nowMs)) why = `it can't start before ${startLabel(earliestFor(t, nowMs))}`;
    else if (!x.pinned) {
      if (e > latestFor(t, nowMs) && t.dueByISO) why = `it ended after the ${dueLabel(t.dueByISO)} deadline`;
      else if (away.some((a) => overlaps(a, iv))) why = "you're away then";
      else if (busy.some((b) => overlaps(b, iv))) why = 'something else is now booked at that time';
      else if ((credited.get(t.id) ?? 0) >= t.durationMin) why = 'the task no longer needs it';
    }
    if (why) {
      moved.push({ eventId: x.eventId, taskId: t.id, why });
      markReplaceable(t.id, x.eventId);
      continue;
    }
    occupy({ taskId: t.id, title: t.title, category: t.category, ...keptFields });
  }

  const gridUp = (ms: number) => Math.ceil(ms / (15 * MIN)) * 15 * MIN;

  /**
   * Ranked free slots of `size` minutes in [lo, hi): one list for the
   * preferred part of the day, then one for the whole window.
   */
  const slotsIn = (
    category: string,
    size: number,
    lo: number,
    hi: number,
    preferred: PreferredWindow | null | undefined,
    weekends: boolean,
  ): RankedSlot[][] => {
    if (hi <= lo) return [];
    const asBusy = busy.map((b) => ({ start: iso(b.s), end: iso(b.e) }));
    const win = dayWindowFor(profile, category);
    const windows = preferred
      ? [
          { start: Math.max(win.start, WINDOWS[preferred].start), end: Math.min(win.end, WINDOWS[preferred].end) },
          win,
        ].filter((w) => w.end > w.start)
      : [win];
    return windows.map((w) =>
      rankFreeSlots(
        asBusy,
        {
          durationMin: size,
          count: 1,
          earliestISO: iso(gridUp(lo)),
          latestISO: iso(hi),
          dayStartHour: w.start,
          dayEndHour: w.end,
          bufferMin: 0,
          skipWeekends: !weekends,
          category,
        },
        profile,
      ),
    );
  };

  /**
   * The day's shape on top of the slot's own score: demanding work leans to
   * the lighter day, and hard tasks spread out or cluster as the user prefers.
   */
  const shaped = (r: RankedSlot, weight: number, hard: boolean): number => {
    const d = dayStart(Date.parse(r.startISO));
    let score = r.score;
    if (hard && strategy === 'cluster') {
      if ((hardLoad.get(d) ?? 0) > 0) score += HARD_STRATEGY_WEIGHT;
    } else {
      if (weight > 0) score -= LOAD_BALANCE_WEIGHT * Math.min(1, (load.get(d) ?? 0) / cap);
      if (hard && (hardLoad.get(d) ?? 0) > 0) score -= HARD_STRATEGY_WEIGHT;
    }
    return score;
  };
  const underCap = (r: RankedSlot, size: number, weight: number) =>
    weight === 0 || (load.get(dayStart(Date.parse(r.startISO))) ?? 0) + size * weight <= cap;

  // ── habits ──────────────────────────────────────────────────────────────
  const habitList = [...habits.values()].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const minOf = (h: PlanHabit) => Math.min(h.perWeek, Math.max(1, h.minPerWeek ?? h.perWeek));

  /** Add sessions of `h` in week `w` until it has `upTo`. */
  const placeHabit = (h: PlanHabit, w: number, upTo: number) => {
    const lo = Math.max(nowMs, w);
    const hi = w + 7 * DAY;
    const weight = weightOf({ habitId: h.id });
    while (habitDays(h.id, w).size < upTo) {
      const days = habitDays(h.id, w);
      let pick: RankedSlot | null = null;
      for (const capped of [true, false]) {
        for (const ranked of slotsIn(h.category, h.durationMin, lo, hi, h.preferredWindow, !skipsWeekends(h))) {
          // One a day, and not the day either side of another session if the week allows.
          const scored = ranked
            .filter((r) => !days.has(dayStart(Date.parse(r.startISO))) && (!capped || underCap(r, h.durationMin, weight)))
            .map((r) => {
              const d = dayStart(Date.parse(r.startISO));
              const near = days.has(d - DAY) || days.has(d + DAY) ? HABIT_ADJACENT_PENALTY : 0;
              return { ...r, score: shaped(r, weight, false) - near };
            })
            .sort((a, b) => b.score - a.score || Date.parse(a.startISO) - Date.parse(b.startISO));
          if (scored.length) {
            pick = scored[0];
            break;
          }
        }
        if (pick) break;
      }
      if (!pick) return;
      const replaces = replaceable.get(`h:${h.id}:${w}`) ?? [];
      occupy({
        habitId: h.id,
        title: h.title,
        category: h.category,
        startISO: pick.startISO,
        endISO: pick.endISO,
        status: 'new',
        ...(replaces.length ? { replacesEventId: replaces.shift()! } : {}),
        score: pick.score,
        features: pick.features,
        reason: pick.reason,
      });
    }
  };

  // ── tasks ───────────────────────────────────────────────────────────────
  const remaining = (t: PlanTask) => Math.max(0, t.durationMin - (credited.get(t.id) ?? 0));

  /** The legal slots for a session of `t`, best first, from the first part of the day that has any. */
  const candidatesFor = (t: PlanTask, size: number, avoidDays: Set<number> | null, capped: boolean): RankedSlot[] => {
    const preferBy = t.preferByISO ? Date.parse(t.preferByISO) : NaN;
    const weight = EFFORT_WEIGHT[t.effort ?? 'normal'];
    const hard = t.effort === 'hard';
    for (const ranked of slotsIn(t.category, size, earliestFor(t, nowMs), latestFor(t, nowMs), t.preferredWindow, !skipsWeekends(t))) {
      const pick = ranked
        .filter((r) => !avoidDays || !avoidDays.has(dayStart(Date.parse(r.startISO))))
        .filter((r) => !capped || underCap(r, size, weight))
        .map((r) => ({
          ...r,
          score: shaped(r, weight, hard) + (Number.isFinite(preferBy) && Date.parse(r.endISO) <= preferBy ? PREFER_BY_BONUS : 0),
        }))
        .sort((a, b) => b.score - a.score || Date.parse(a.startISO) - Date.parse(b.startISO));
      if (pick.length) return pick;
    }
    return [];
  };
  const bestFor = (t: PlanTask, size: number, avoidDays: Set<number> | null, capped: boolean): RankedSlot | null =>
    candidatesFor(t, size, avoidDays, capped)[0] ?? null;
  /**
   * Inside the day's budget first, then over it. Within each, a splittable
   * task tries a day it has no session on yet before doubling up.
   */
  const best = (t: PlanTask, size: number): RankedSlot | null => {
    const used = daysOf(t.id);
    for (const capped of [true, false]) {
      const slot = (t.splittable ? bestFor(t, size, used, capped) : null) ?? bestFor(t, size, null, capped);
      if (slot) return slot;
    }
    return null;
  };

  type Miss = { need: number; left: number; size: number; free: { total: number; longest: number }; gaveWayTo?: string };
  const misses = new Map<string, Miss | Unplaced>();

  /** Place what `t` still needs. A miss is recorded against the time free when its turn came. */
  const placeTask = (t: PlanTask) => {
    let left = remaining(t);
    if (left <= 0) return;
    if (t.dueByISO && Date.parse(t.dueByISO) <= nowMs) {
      misses.set(t.id, {
        taskId: t.id,
        title: t.title,
        neededMin: left,
        placedMin: credited.get(t.id) ?? 0,
        reason: `it was due ${dueLabel(t.dueByISO)}, which has passed`,
        options: [`${t.title} due next week`, `done with ${t.title}`],
      });
      return;
    }
    if (t.dueByISO && earliestFor(t, nowMs) >= Date.parse(t.dueByISO)) {
      misses.set(t.id, {
        taskId: t.id,
        title: t.title,
        neededMin: left,
        placedMin: credited.get(t.id) ?? 0,
        reason: `it can't start before ${startLabel(earliestFor(t, nowMs))}, after its ${dueLabel(t.dueByISO)} deadline`,
        options: [`${t.title} due next week`],
      });
      return;
    }
    const need = left;
    const free = freeMinutes(t, profile, busy, nowMs);
    const replaces = replaceable.get(t.id) ?? [];
    let lastSize = 0;
    while (left > 0) {
      let size = sessionSize(left, t);
      let slot = best(t, size);
      // A splittable task shrinks its session before giving up on it.
      while (!slot && t.splittable && size - 15 >= Math.max(15, t.minChunkMin)) {
        size -= 15;
        slot = best(t, size);
      }
      if (!slot) {
        lastSize = size;
        break;
      }
      occupy({
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
      left -= size;
    }
    if (left > 0) misses.set(t.id, { need, left, size: lastSize, free });
    else misses.delete(t.id);
  };

  // ── order ───────────────────────────────────────────────────────────────
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
  const required = ordered.filter((t) => !isOptional(t));
  const optional = ordered.filter(isOptional);

  // ── place: habit minimums → tasks → priority bumps → habit extras → optional tasks
  const weeks = habitWeeks(nowMs);
  for (const w of weeks) for (const h of habitList) placeHabit(h, w, minOf(h));

  for (const t of required) placeTask(t);

  // A task that didn't fit may take the place of new sessions of a task that
  // matters less — kept only when it then fits whole.
  for (const t of required) {
    const m = misses.get(t.id);
    if (!m || !('need' in m)) continue;
    const lo = earliestFor(t, nowMs);
    const hi = latestFor(t, nowMs);
    const victims = [
      ...new Set(
        blocks
          .filter((b) => b.status === 'new' && b.taskId && Date.parse(b.endISO) > lo && Date.parse(b.startISO) < hi)
          .map((b) => b.taskId!)
          .filter((id) => PRIORITY_RANK[tasks.get(id)!.priority] > PRIORITY_RANK[t.priority]),
      ),
    ].sort(
      (a, b) =>
        PRIORITY_RANK[tasks.get(b)!.priority] - PRIORITY_RANK[tasks.get(a)!.priority] ||
        dueOf(tasks.get(b)!) - dueOf(tasks.get(a)!) ||
        a.localeCompare(b),
    );
    for (const vid of victims.slice(0, MAX_BUMP_TRIES)) {
      const before = snapshot();
      const beforeMisses = new Map(misses);
      for (const b of blocks.filter((x) => x.status === 'new' && x.taskId === vid)) release(b);
      placeTask(t);
      if (!misses.has(t.id)) {
        const v = tasks.get(vid)!;
        placeTask(v);
        const vm = misses.get(vid);
        if (vm && 'need' in vm) vm.gaveWayTo = t.title;
        break;
      }
      restore(before);
      misses.clear();
      for (const [k, v] of beforeMisses) misses.set(k, v);
    }
  }

  for (const w of weeks) for (const h of habitList) placeHabit(h, w, h.perWeek);
  for (const t of optional) placeTask(t);

  // ── what didn't fit, and what fell short of ideal ───────────────────────
  const unplaced: Unplaced[] = [];
  const notes: string[] = [];
  for (const t of ordered) {
    const m = misses.get(t.id);
    if (!m) continue;
    if (!('need' in m)) {
      unplaced.push(m);
      continue;
    }
    const miss = explainMiss(t, { need: m.need, left: m.left, size: m.size, placedMin: credited.get(t.id) ?? 0, free: m.free });
    if (m.gaveWayTo) miss.reason += ` — it gave way to ${m.gaveWayTo}, which matters more`;
    miss.reason += awayNote(earliestFor(t, nowMs), latestFor(t, nowMs));
    if (isOptional(t)) {
      miss.optional = true;
      miss.reason += ' (it is low priority with no deadline, so it went last)';
    }
    unplaced.push(miss);
  }
  for (const w of weeks) {
    const lo = Math.max(nowMs, w);
    const hi = w + 7 * DAY;
    const which = w === weekStart(nowMs) ? 'this week' : 'next week';
    for (const h of habitList) {
      const have = habitDays(h.id, w).size;
      const min = minOf(h);
      if (have >= h.perWeek) continue;
      if (have >= min) {
        notes.push(`${h.title}: ${have} session${have === 1 ? '' : 's'} ${which} — your minimum; ${h.perWeek} didn't fit${awayNote(lo, hi)}.`);
        continue;
      }
      const options: string[] = [];
      if (have >= 1) options.push(`${h.title} ${have}x a week`);
      if (h.durationMin > 30) options.push(`${h.title} takes ${hours(h.durationMin - 30)}`);
      unplaced.push({
        habitId: h.id,
        title: h.title,
        neededMin: (min - have) * h.durationMin,
        placedMin: have * h.durationMin,
        reason: `only ${have} of ${min === h.perWeek ? h.perWeek : `at least ${min}`} sessions fit ${which}${awayNote(lo, hi)}`,
        options,
      });
    }
  }

  blocks.sort((a, b) => Date.parse(a.startISO) - Date.parse(b.startISO));
  return { blocks, unplaced, order: [...required, ...optional].map((t) => t.id), moved, notes };
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
  const habits = new Map((input.habits ?? []).map((h) => [h.id, h]));
  const problems: string[] = [];
  const toIv = (b: Busy) => ({ s: Date.parse(b.start), e: Date.parse(b.end) });
  const busy = input.busy.map(toIv);
  const away = (input.away ?? []).map(toIv);
  const placed: (Iv & { label: string; status: PlannedBlock['status'] })[] = [];
  const minutes = new Map<string, { kept: number; added: number }>();
  /** "habitId week" → sessions placed in it, how many are new, and on which days */
  const weeks = new Map<string, { habitId: string; n: number; added: number; days: Set<number> }>();

  for (const b of plan.blocks) {
    const t = b.taskId ? tasks.get(b.taskId) : undefined;
    const h = b.habitId ? habits.get(b.habitId) : undefined;
    const iv = { s: Date.parse(b.startISO), e: Date.parse(b.endISO) };
    const label = `${b.title} ${b.startISO}`;
    const item = t ?? h;
    if (!item) {
      problems.push(`${label}: unknown task or habit`);
      continue;
    }
    if (!(iv.e > iv.s)) problems.push(`${label}: empty or inverted`);
    if (b.status === 'new') {
      if (iv.s < nowMs) problems.push(`${label}: starts in the past`);
      if (t?.dueByISO && iv.e > Date.parse(t.dueByISO)) problems.push(`${label}: ends after the deadline`);
      if (t && iv.s < earliestFor(t, nowMs)) problems.push(`${label}: starts before its not-before`);
      if (busy.some((x) => overlaps(x, iv))) problems.push(`${label}: overlaps busy time`);
      if (away.some((x) => overlaps(x, iv))) problems.push(`${label}: overlaps time away`);
      const win = dayWindowFor(input.profile, item.category);
      const from = (iv.s - dayStart(iv.s)) / (60 * MIN);
      const to = from + (iv.e - iv.s) / (60 * MIN);
      if (from < win.start || to > win.end) problems.push(`${label}: outside the day window`);
      if (skipsWeekends(item) && isWeekend(iv.s)) problems.push(`${label}: on a weekend`);
    }
    for (const p of placed) {
      if (overlaps(p, iv) && (b.status === 'new' || p.status === 'new')) problems.push(`${label}: overlaps ${p.label}`);
    }
    placed.push({ ...iv, label, status: b.status });
    if (t) {
      const m = minutes.get(t.id) ?? { kept: 0, added: 0 };
      m[b.status === 'new' ? 'added' : 'kept'] += Math.round((iv.e - iv.s) / MIN);
      minutes.set(t.id, m);
    } else if (h) {
      const key = `${h.id} ${weekStart(iv.s)}`;
      const w = weeks.get(key) ?? { habitId: h.id, n: 0, added: 0, days: new Set<number>() };
      if (b.status === 'new' && w.days.has(dayStart(iv.s))) problems.push(`${label}: a second ${h.title} session that day`);
      w.n++;
      if (b.status === 'new') w.added++;
      w.days.add(dayStart(iv.s));
      weeks.set(key, w);
    }
  }
  // New sessions only ever top a task up to what it needs; kept ones may exceed it.
  for (const [id, m] of minutes) {
    const t = tasks.get(id)!;
    if (m.added > 0 && m.kept + m.added > t.durationMin) {
      problems.push(`${t.title}: ${m.kept + m.added} min placed for a ${t.durationMin}-min task`);
    }
  }
  // …and a habit's week up to its target.
  for (const w of weeks.values()) {
    const h = habits.get(w.habitId)!;
    if (w.added > 0 && w.n > h.perWeek) problems.push(`${h.title}: ${w.n} sessions in a week for ${h.perWeek}x a week`);
  }
  return problems;
}
