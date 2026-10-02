/**
 * The onboarding contract — shared by the `/welcome` page (live preview) and
 * `POST /api/onboarding` (validation + what gets written). Zero RN / Node
 * imports so both sides, and `onboarding.check.ts`, can load it.
 *
 * Every answer maps onto a field the planner already reads
 * (`scheduler_profiles`, see src/server/ai/preferences.ts `AgentProfile`):
 *
 *   days + start/end  → work_hours        (when plans may land)
 *   peak              → energy_curve      (where hard work is ranked first)
 *   focusH            → max_daily_focus_min + focus_goal_h
 *   hardWork          → hard_work         ('spread' | 'cluster')
 *   timezone, clock24, weekStart → the calendar's own settings
 */

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type Peak = 'morning' | 'midday' | 'afternoon' | 'evening';
export type HardWork = 'spread' | 'cluster';

export type OnboardingAnswers = {
  firstName: string;
  days: Weekday[];
  /** whole hours, 0–24 */
  start: number;
  end: number;
  peak: Peak;
  /** hours of deep work a working day, 1–6 */
  focusH: number;
  hardWork: HardWork;
  timezone: string;
  clock24: boolean;
  weekStart: 0 | 1;
};

export const PEAKS: { id: Peak; label: string; hint: string; from: number; to: number }[] = [
  { id: 'morning', label: 'Morning', hint: '8 – 11', from: 8, to: 11 },
  { id: 'midday', label: 'Late morning', hint: '10 – 13', from: 10, to: 13 },
  { id: 'afternoon', label: 'Afternoon', hint: '14 – 17', from: 14, to: 17 },
  { id: 'evening', label: 'Evening', hint: '17 – 20', from: 17, to: 20 },
];

export const FOCUS_MIN = 1;
export const FOCUS_MAX = 6;

/** A sensible first guess: the planner's own defaults plus the browser's clock. */
export function defaultAnswers(env?: { timezone?: string; clock24?: boolean }): OnboardingAnswers {
  return {
    firstName: '',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    start: 9,
    end: 18,
    peak: 'morning',
    focusH: 3,
    hardWork: 'spread',
    timezone: env?.timezone || 'Europe/Berlin',
    clock24: env?.clock24 ?? true,
    weekStart: 1,
  };
}

const isHour = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 24;

/** Validate an untrusted body. Returns the cleaned answers or an error message. */
export function checkAnswers(raw: unknown): { ok: true; value: OnboardingAnswers } | { ok: false; error: string } {
  const a = (raw ?? {}) as Partial<OnboardingAnswers>;
  const days = Array.isArray(a.days) ? a.days.filter((d): d is Weekday => (WEEKDAYS as readonly string[]).includes(d)) : [];
  if (!days.length) return { ok: false, error: 'Pick at least one working day.' };
  if (!isHour(a.start) || !isHour(a.end) || a.end - a.start < 2) {
    return { ok: false, error: 'Working hours must span at least 2 hours.' };
  }
  if (!PEAKS.some((p) => p.id === a.peak)) return { ok: false, error: 'Unknown peak time.' };
  if (typeof a.focusH !== 'number' || !Number.isFinite(a.focusH) || a.focusH < FOCUS_MIN || a.focusH > FOCUS_MAX) {
    return { ok: false, error: `Deep work must be ${FOCUS_MIN}–${FOCUS_MAX} hours a day.` };
  }
  if (a.hardWork !== 'spread' && a.hardWork !== 'cluster') return { ok: false, error: 'Unknown hard-work layout.' };
  const timezone = typeof a.timezone === 'string' ? a.timezone : '';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    return { ok: false, error: 'Unknown time zone.' };
  }
  if (!timezone) return { ok: false, error: 'Unknown time zone.' };
  return {
    ok: true,
    value: {
      firstName: typeof a.firstName === 'string' ? a.firstName.trim().slice(0, 60) : '',
      days: WEEKDAYS.filter((d) => days.includes(d)),
      start: a.start,
      end: a.end,
      peak: a.peak as Peak,
      focusH: Math.round(a.focusH * 2) / 2,
      hardWork: a.hardWork,
      timezone,
      clock24: a.clock24 !== false,
      weekStart: a.weekStart === 0 ? 0 : 1,
    },
  };
}

/** `work_hours` as the planner stores it: every day present, `null` = day off. */
export function workHoursOf(a: Pick<OnboardingAnswers, 'days' | 'start' | 'end'>) {
  return Object.fromEntries(
    WEEKDAYS.map((d) => [d, a.days.includes(d) ? { start: a.start, end: a.end } : null]),
  ) as Record<Weekday, { start: number; end: number } | null>;
}

/**
 * `energy_curve` rows ({hour, level}) for a chosen peak: 1.0 across the peak,
 * falling off 0.15 per hour either side, floored at 0.2. Covers 6–21 so the
 * stored curve fully replaces the default one (repo.ts `toEnergyMap`).
 */
export function energyCurveFor(peak: Peak): { hour: number; level: number }[] {
  const p = PEAKS.find((x) => x.id === peak) ?? PEAKS[0];
  const out: { hour: number; level: number }[] = [];
  for (let h = 6; h <= 21; h++) {
    const dist = h < p.from ? p.from - h : h >= p.to ? h - p.to + 1 : 0;
    out.push({ hour: h, level: Math.max(0.2, Math.round((1 - 0.15 * dist) * 100) / 100) });
  }
  return out;
}

// ── preview ────────────────────────────────────────────────────────────────

/** A block on the preview week, minutes from midnight. */
export type PreviewBlock = { id: string; day: number; s: number; e: number; title: string; kind: 'meeting' | 'focus' };

/**
 * Example meetings for the preview, so the focus blocks have something to work
 * around. Labelled "example" in the UI — they are not the user's calendar.
 */
const SAMPLE_MEETINGS: { day: number; s: number; e: number; title: string }[] = [
  { day: 0, s: 10 * 60, e: 10 * 60 + 30, title: 'Team sync' },
  { day: 1, s: 14 * 60, e: 15 * 60, title: '1:1' },
  { day: 2, s: 9 * 60 + 30, e: 10 * 60, title: 'Stand-up' },
  { day: 3, s: 16 * 60, e: 17 * 60, title: 'Review' },
  { day: 4, s: 11 * 60, e: 12 * 60, title: 'Planning' },
  { day: 5, s: 10 * 60, e: 11 * 60, title: 'Brunch' },
];

/**
 * Where deep work would go in an example week under these answers. A small,
 * honest stand-in for the planner: blocks fill the peak window first, then the
 * rest of the working day, never over a meeting, at most `focusH` per day.
 * `spread` gives every working day a share; `cluster` front-loads the same
 * weekly total onto as few days as fit.
 */
export function previewWeek(a: Pick<OnboardingAnswers, 'days' | 'start' | 'end' | 'peak' | 'focusH' | 'hardWork'>): PreviewBlock[] {
  const work = WEEKDAYS.map((d) => a.days.includes(d));
  const meetings: PreviewBlock[] = SAMPLE_MEETINGS.filter(
    (m) => work[m.day] && m.s >= a.start * 60 && m.e <= a.end * 60,
  ).map((m, i) => ({ id: `m${i}`, ...m, kind: 'meeting' }));

  const peak = PEAKS.find((p) => p.id === a.peak) ?? PEAKS[0];
  const dayMin = (a.end - a.start) * 60;
  const capMin = Math.min(a.focusH * 60, dayMin);
  const workDays = WEEKDAYS.map((_, i) => i).filter((i) => work[i]);
  const weekly = capMin * workDays.length;

  // Per-day budget: spread = even; cluster = fill days to 1.6× in order.
  const budget = new Map<number, number>();
  if (a.hardWork === 'spread') {
    for (const d of workDays) budget.set(d, capMin);
  } else {
    let left = weekly;
    const fat = Math.min(dayMin, Math.round((capMin * 1.6) / 30) * 30);
    for (const d of workDays) {
      const take = Math.min(fat, left);
      budget.set(d, take);
      left -= take;
    }
  }

  const blocks: PreviewBlock[] = [...meetings];
  for (const d of workDays) {
    let want = budget.get(d) ?? 0;
    if (want < 30) continue;
    const busy = meetings.filter((m) => m.day === d);
    // Peak hours first, then outward from the peak through the working day.
    const order: number[] = [];
    const lo = Math.max(a.start, peak.from);
    const hi = Math.min(a.end, peak.to);
    for (let h = lo; h < hi; h++) order.push(h);
    for (let off = 1; off < 24; off++) {
      if (hi - 1 + off < a.end) order.push(hi - 1 + off);
      if (lo - off >= a.start) order.push(lo - off);
    }
    // Hour-long chunks where they fit (short slivers are no use for deep work),
    // half-hours only to finish the budget.
    const taken: [number, number][] = [];
    const free = (s: number, e: number) =>
      s >= a.start * 60 &&
      e <= a.end * 60 &&
      // keep a 10-minute buffer to meetings, like defaultBufferMin
      !busy.some((m) => s < m.e + 10 && e > m.s - 10) &&
      !taken.some(([ts, te]) => s < te && e > ts);
    for (const len of [60, 30]) {
      for (const h of order) {
        for (const half of [0, 30]) {
          if (want < len) break;
          const s = h * 60 + half;
          if (!free(s, s + len)) continue;
          taken.push([s, s + len]);
          want -= len;
        }
      }
    }
    // Merge touching chunks into blocks of up to 3 hours.
    taken.sort((x, y) => x[0] - y[0]);
    const merged: [number, number][] = [];
    for (const t of taken) {
      const last = merged[merged.length - 1];
      if (last && last[1] === t[0] && t[1] - last[0] <= 180) last[1] = t[1];
      else merged.push([t[0], t[1]]);
    }
    merged.forEach(([s, e], i) => blocks.push({ id: `f${d}-${i}`, day: d, s, e, title: 'Deep work', kind: 'focus' }));
  }
  return blocks;
}

export function hourLabel(h: number, clock24: boolean): string {
  if (clock24) return `${String(h % 24).padStart(2, '0')}:00`;
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh} ${h % 24 < 12 ? 'am' : 'pm'}`;
}
