/**
 * The onboarding contract — shared by the `/welcome` pages (web + native),
 * `POST|GET /api/onboarding`, and `onboarding.check.ts`. No RN / Node imports.
 *
 * Every answer maps onto a field the planner already reads
 * (`scheduler_profiles`, see src/server/ai/preferences.ts `AgentProfile`), in
 * groups so a returning user only overwrites what they actually changed:
 *
 *   name      firstName                 → the Clerk user
 *   hours     days + start/end          → work_hours
 *   peak      peak                      → energy_curve  (replaces a learned curve —
 *                                          only written when the user picks a peak)
 *   focus     focusH                    → max_daily_focus_min + focus_goal_h
 *   hardWork  hardWork                  → hard_work
 *   prefs     timezone, clock24, weekStart → the calendar's settings
 */
import { type Busy, rankFreeSlots } from '@/server/ai/find-time';
import { type AgentProfile, DEFAULT_ENERGY, defaultProfile } from '@/server/ai/preferences';

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

export const GROUPS = ['name', 'hours', 'peak', 'focus', 'hardWork', 'prefs'] as const;
export type Group = (typeof GROUPS)[number];

/** Which group each answer belongs to — `patch()` marks groups changed from this. */
export const GROUP_OF: Record<keyof OnboardingAnswers, Group> = {
  firstName: 'name',
  days: 'hours',
  start: 'hours',
  end: 'hours',
  peak: 'peak',
  focusH: 'focus',
  hardWork: 'hardWork',
  timezone: 'prefs',
  clock24: 'prefs',
  weekStart: 'prefs',
};

export const PEAKS: { id: Peak; label: string; hint: string; from: number; to: number }[] = [
  { id: 'morning', label: 'Morning', hint: '8 – 11', from: 8, to: 11 },
  { id: 'midday', label: 'Late morning', hint: '10 – 13', from: 10, to: 13 },
  { id: 'afternoon', label: 'Afternoon', hint: '14 – 17', from: 14, to: 17 },
  { id: 'evening', label: 'Evening', hint: '17 – 20', from: 17, to: 20 },
];

export const FOCUS_MIN = 1;
export const FOCUS_MAX = 6;

/** A sensible first guess: the planner's own defaults plus the device's clock. */
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

/**
 * Browsers list some zones under their old IANA names (ICU keeps the legacy
 * ids canonical): searching "kolkata" or "kyiv" would find nothing. Show and
 * save the current name instead — Intl accepts both.
 */
const MODERN: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Rangoon': 'Asia/Yangon',
  'Europe/Kiev': 'Europe/Kyiv',
  'America/Godthab': 'America/Nuuk',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Pacific/Truk': 'Pacific/Chuuk',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
};

export const modernZone = (z: string) => MODERN[z] ?? z;

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
  if (!timezone) return { ok: false, error: 'Unknown time zone.' };
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    return { ok: false, error: 'Unknown time zone.' };
  }
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

/** Untrusted `changed` list → known groups. A missing list means "all" (first-time users). */
export function checkGroups(raw: unknown): Group[] {
  if (!Array.isArray(raw)) return [...GROUPS];
  return GROUPS.filter((g) => raw.includes(g));
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

/** The peak whose curve is closest to a stored one (least squares over 6–21h). */
export function peakFromCurve(curve: Partial<Record<number, number>>): Peak {
  // Never set (empty, or still the planner's default curve) → the form's default.
  const hours = Object.keys(curve);
  if (!hours.length || hours.every((h) => curve[Number(h)] === DEFAULT_ENERGY[Number(h)])) return 'morning';
  let best: Peak = 'morning';
  let bestErr = Infinity;
  for (const p of PEAKS) {
    let err = 0;
    for (const { hour, level } of energyCurveFor(p.id)) {
      const v = curve[hour] ?? DEFAULT_ENERGY[hour] ?? 0.5;
      err += (v - level) ** 2;
    }
    if (err < bestErr) {
      bestErr = err;
      best = p.id;
    }
  }
  return best;
}

/**
 * What a returning user has already told the app, as onboarding answers, so
 * the form opens on their settings rather than the defaults. Working hours
 * that differ by day collapse to the most common span (the form has one).
 */
export function answersFromProfile(p: {
  firstName: string;
  timezone: string;
  clock24: boolean;
  weekStart: 0 | 1;
  workHours: Partial<Record<string, { start: number; end: number } | null>>;
  energyCurve: Partial<Record<number, number>>;
  maxDailyFocusMin: number;
  hardWork: HardWork;
}): OnboardingAnswers {
  const days = WEEKDAYS.filter((d) => p.workHours[d]);
  const spans = new Map<string, number>();
  for (const d of days) {
    const w = p.workHours[d]!;
    const k = `${w.start}-${w.end}`;
    spans.set(k, (spans.get(k) ?? 0) + 1);
  }
  const top = [...spans.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
  const [start, end] = top ? top.split('-').map(Number) : [9, 18];
  const focusH = Math.min(FOCUS_MAX, Math.max(FOCUS_MIN, Math.round((p.maxDailyFocusMin / 60) * 2) / 2));
  return {
    firstName: p.firstName,
    days: days.length ? days : ['mon', 'tue', 'wed', 'thu', 'fri'],
    start: isHour(start) ? start : 9,
    end: isHour(end) && end > start ? end : 18,
    peak: peakFromCurve(p.energyCurve),
    focusH,
    hardWork: p.hardWork,
    timezone: p.timezone,
    clock24: p.clock24,
    weekStart: p.weekStart,
  };
}

// ── preview ────────────────────────────────────────────────────────────────

/** A block on the preview week, minutes from midnight; day 0 = Monday. */
export type PreviewBlock = { id: string; day: number; s: number; e: number; title: string; kind: 'meeting' | 'focus' };

/**
 * Example meetings for when no calendar is connected, so the deep work has
 * something to plan around. Labelled "example" wherever they are shown.
 */
export const SAMPLE_MEETINGS: PreviewBlock[] = [
  { id: 'x0', day: 0, s: 10 * 60, e: 10 * 60 + 30, title: 'Team sync', kind: 'meeting' },
  { id: 'x1', day: 1, s: 14 * 60, e: 15 * 60, title: '1:1', kind: 'meeting' },
  { id: 'x2', day: 2, s: 9 * 60 + 30, e: 10 * 60, title: 'Stand-up', kind: 'meeting' },
  { id: 'x3', day: 3, s: 16 * 60, e: 17 * 60, title: 'Review', kind: 'meeting' },
  { id: 'x4', day: 4, s: 11 * 60, e: 12 * 60, title: 'Planning', kind: 'meeting' },
];

/** The planner's profile under these answers — what it would rank with after onboarding. */
export function profileFrom(a: Pick<OnboardingAnswers, 'days' | 'start' | 'end' | 'peak' | 'focusH' | 'hardWork' | 'timezone'>): AgentProfile {
  const p = defaultProfile();
  p.timezone = a.timezone;
  p.workHours = workHoursOf(a);
  p.energyCurve = Object.fromEntries(energyCurveFor(a.peak).map((e) => [e.hour, e.level]));
  p.maxDailyFocusMin = Math.round(a.focusH * 60);
  p.hardWork = a.hardWork;
  return p;
}

/** A Monday 00:00 in the wall-clock convention; any Monday works, the preview is weekday-only. */
const WEEK0 = Date.UTC(2026, 8, 14);
const DAY = 86_400_000;
const MIN = 60_000;
/** the planner's own cap on one sitting (landing demo `MAX_SESSION`) */
const MAX_SESSION = 150;
const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Where deep work would land this week under these answers, placed by the
 * planner's own ranking (`rankFreeSlots` in src/server/ai/find-time.ts, the
 * scorer behind Plan with AI) using the profile the answers would save — so
 * the energy curve, working hours and buffers are the real ones.
 *
 * Budgeting mirrors the profile: `focusH` a day when spread; when clustered,
 * the same weekly total on as few days as fit (about 1.6× a day). Each day's
 * budget is split into even sittings of at most 2½ h, each placed at the
 * best-ranked free time left, until the budget is spent or nothing fits.
 *
 * `meetings` defaults to the example week; pass the user's own (from
 * GET /api/onboarding) once a calendar is connected.
 */
export function previewWeek(
  a: Pick<OnboardingAnswers, 'days' | 'start' | 'end' | 'peak' | 'focusH' | 'hardWork' | 'timezone'>,
  meetings: PreviewBlock[] = SAMPLE_MEETINGS,
): PreviewBlock[] {
  const work = WEEKDAYS.map((d) => a.days.includes(d));
  const shown = meetings.filter((m) => m.kind === 'meeting');
  const profile = profileFrom(a);

  const dayMin = (a.end - a.start) * 60;
  const capMin = Math.min(a.focusH * 60, dayMin);
  const workDays = WEEKDAYS.map((_, i) => i).filter((i) => work[i]);

  const budget = new Map<number, number>();
  if (a.hardWork === 'spread') {
    for (const d of workDays) budget.set(d, capMin);
  } else {
    let left = capMin * workDays.length;
    const fat = Math.min(dayMin, Math.round((capMin * 1.6) / 30) * 30);
    for (const d of workDays) {
      const take = Math.min(fat, left);
      budget.set(d, take);
      left -= take;
    }
  }

  const at = (day: number, min: number) => WEEK0 + day * DAY + min * MIN;
  // All meetings are busy, working day or not; placed sittings join them,
  // padded by the profile's buffer so two sittings never butt together.
  const busy: Busy[] = shown.map((m) => ({ start: iso(at(m.day, m.s)), end: iso(at(m.day, m.e)) }));
  const buffer = profile.defaultBufferMin;
  const out: PreviewBlock[] = [...shown];

  for (const d of workDays) {
    let want = budget.get(d) ?? 0;
    if (want < 30) continue;
    // Even sittings of at most 2½ h: 3 h is 2 × 1½ h, not 2½ h plus a sliver.
    const sittings = Math.ceil(want / MAX_SESSION);
    const even = Math.max(30, Math.round(want / sittings / 30) * 30);
    let n = 0;
    while (want >= 30) {
      let placed = false;
      const first = Math.min(even, Math.floor(want / 30) * 30);
      for (const len of [first, 60, 30].filter((l, i, xs) => l <= first && xs.indexOf(l) === i)) {
        const ranked = rankFreeSlots(
          busy,
          {
            durationMin: len,
            count: 1,
            earliestISO: iso(at(d, a.start * 60)),
            latestISO: iso(at(d, a.end * 60)),
            dayStartHour: a.start,
            dayEndHour: a.end,
            bufferMin: buffer,
            category: 'deep-work',
          },
          profile,
        );
        const best = ranked[0];
        if (!best) continue;
        const s = Math.round((Date.parse(best.startISO) - at(d, 0)) / MIN);
        out.push({ id: `f${d}-${n++}`, day: d, s, e: s + len, title: 'Deep work', kind: 'focus' });
        busy.push({ start: iso(at(d, s - buffer)), end: iso(at(d, s + len + buffer)) });
        want -= len;
        placed = true;
        break;
      }
      if (!placed) break;
    }
  }
  return out;
}

export function hourLabel(h: number, clock24: boolean): string {
  if (clock24) return `${String(h % 24).padStart(2, '0')}:00`;
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh} ${h % 24 < 12 ? 'am' : 'pm'}`;
}

/** Deep-work minutes per weekday (mon=0) — the mobile strip and stats read this. */
export function focusByDay(blocks: PreviewBlock[]): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const b of blocks) if (b.kind === 'focus') out[b.day] += b.e - b.s;
  return out;
}

/** The first request a new week gets — onboarding's finish and the calendar's empty week both send it to Plan with AI. */
export const PLACE_DEEP_WORK = 'Plan my deep work for this week in my best hours';

// ── drop-off tracking ──────────────────────────────────────────────────────

export const TRACK_ACTIONS = ['view', 'connect', 'connected', 'connect_failed', 'skip', 'finish'] as const;
export type TrackAction = (typeof TRACK_ACTIONS)[number];
export const TRACK_STEPS = ['name', 'calendar', 'week', 'peak', 'focus', 'done'] as const;
export type TrackStep = (typeof TRACK_STEPS)[number];
