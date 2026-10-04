/**
 * "Gym today 6–8pm" — placing a block at the time the user said, instead of
 * handing it to the scorer. Before this, every request went through
 * propose_blocks, which picks its own slot, so a user who named a time got a
 * different one back: the agent "just proposed" rather than doing as asked.
 *
 * The model reads the times out of the sentence; everything after that is
 * here, and deterministic. Pure — no DB, no clock (callers pass nowISO), so
 * place-at.check.mjs runs it directly.
 *
 * Times are wall-clock with a `Z` suffix, like every other time in the app.
 */

export type Span = { startISO: string; endISO: string };
export type PlaceCheck = { ok: true; span: Span } | { ok: false; reason: string };

const MAX_BLOCK_MIN = 12 * 60;

/* ── weekly repeats: "German class Mon–Thu 11:00–14:45, 5–29 Oct" ── */

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 86_400_000;
/** More than enough for any series a person types; open-ended ones are cut here. */
const MAX_OCCURRENCES = 366;

/** RFC 5545 body the calendar already draws (src/calendar/layout.ts repeatsOn). `until` is the last day, inclusive. */
export function weeklyRule(days: number[], until?: string): string {
  return `FREQ=WEEKLY;BYDAY=${days.map((d) => BYDAY[d]).join(',')}${until ? `;UNTIL=${until.replace(/-/g, '')}T235959` : ''}`;
}

/** Only what weeklyRule writes: weekdays and an optional last day. */
export function readWeeklyRule(rule: unknown): { days: number[]; until: string | null } | null {
  if (typeof rule !== 'string') return null;
  const m = /^FREQ=WEEKLY;BYDAY=((?:SU|MO|TU|WE|TH|FR|SA)(?:,(?:SU|MO|TU|WE|TH|FR|SA))*)(?:;UNTIL=(\d{4})(\d{2})(\d{2})T235959)?$/.exec(rule);
  if (!m) return null;
  return { days: m[1].split(',').map((d) => BYDAY.indexOf(d)), until: m[2] ? `${m[2]}-${m[3]}-${m[4]}` : null };
}

/** Every date (YYYY-MM-DD) the repeat falls on, from `first` through `until` (or `limit` dates when open-ended). */
export function weeklyDates(first: string, days: number[], until: string | null, limit = MAX_OCCURRENCES): string[] {
  const out: string[] = [];
  if (!days.length) return out;
  const end = until ? Date.parse(`${until}T00:00:00Z`) : Infinity;
  for (let ms = Date.parse(`${first}T00:00:00Z`); ms <= end && out.length < limit; ms += DAY_MS) {
    if (days.includes(new Date(ms).getUTCDay())) out.push(new Date(ms).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * A repeating event's times inside [fromISO, toISO). Reads what Find Time
 * writes: weeklyRule's rules and the calendar's plain "FREQ=WEEKLY" (the start's
 * weekday). Anything else stays its first occurrence only, as before — never a guess.
 */
export function expandRepeat<T extends { start: string; end: string; rrule?: string | null }>(ev: T, fromISO: string, toISO: string): T[] {
  const firstDay = ev.start.slice(0, 10);
  const rule = ev.rrule === 'FREQ=WEEKLY' ? { days: [new Date(`${firstDay}T00:00:00Z`).getUTCDay()], until: null } : readWeeklyRule(ev.rrule);
  if (!rule) return ev.start < toISO && ev.end > fromISO ? [ev] : [];
  const from = fromISO.slice(0, 10) > firstDay ? fromISO.slice(0, 10) : firstDay;
  const lastInWindow = new Date(Date.parse(`${toISO.slice(0, 10)}T00:00:00Z`)).toISOString().slice(0, 10);
  const until = rule.until && rule.until < lastInWindow ? rule.until : lastInWindow;
  return weeklyDates(from, rule.days, until)
    .map((d) => ({ ...ev, start: `${d}${ev.start.slice(10)}`, end: `${d}${ev.end.slice(10)}` }))
    .filter((o) => o.start < toISO && o.end > fromISO);
}

/** "Mon–Thu", "Mon, Wed, Fri", "weekdays", "every day". */
export function daysLabel(days: number[]): string {
  const order = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (order.length === 7) return 'every day';
  if (order.join() === '1,2,3,4,5') return 'weekdays';
  const pos = order.map((d) => (d + 6) % 7);
  const run = order.length >= 3 && pos.every((p, i) => i === 0 || p === pos[i - 1] + 1);
  return run ? `${SHORT[order[0]]}–${SHORT[order[order.length - 1]]}` : order.map((d) => SHORT[d]).join(', ');
}

/** "2026-10-01T18:00:00+02:00" → "2026-10-01T18:00:00.000Z": the clock the user said, offset dropped. */
function wallClock(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(raw.trim());
  if (!m) return null;
  const out = `${m[1]}T${m[2]}:${m[3]}:00.000Z`;
  return Number.isFinite(Date.parse(out)) ? out : null;
}

export function checkPlaceAt(startRaw: unknown, endRaw: unknown, nowISO: string, horizonISO: string): PlaceCheck {
  const startISO = wallClock(startRaw);
  const endISO = wallClock(endRaw);
  if (!startISO || !endISO) return { ok: false, reason: 'What time should it start and end?' };
  const [s, e] = [Date.parse(startISO), Date.parse(endISO)];
  if (e <= s) return { ok: false, reason: 'The end has to be after the start. What times did you mean?' };
  if ((e - s) / 60_000 > MAX_BLOCK_MIN) return { ok: false, reason: "That's over 12 hours. What times did you mean?" };
  if (s < Date.parse(nowISO)) return { ok: false, reason: "That time has already passed today. Did you mean another day?" };
  if (s > Date.parse(horizonISO)) return { ok: false, reason: "I can only plan three weeks ahead for now. Pick a closer day?" };
  return { ok: true, span: { startISO, endISO } };
}

/**
 * A bare "at 6" or "5:30" (hours 1–9) with no am/pm, 24h form or time-of-day
 * word is ambiguous. Enforced in code because models skip the prompt rule when
 * one reading "seems likely" — the same lesson as find-time-agent.
 * ponytail: hours 10–12 aren't treated as ambiguous (people rarely mean 22:00); widen if reports say so.
 */
const BARE_TIME = /(?:\bat\s+([1-9])(?::([0-5]\d))?|(?<![\d:.])([1-9]):([0-5]\d)|(?<![\d:.])([1-9])\s*(?:-|–|to)\s*([1-9]|1[0-2])\b)(?![\d:]|\s*(?:am|pm|a\.m|p\.m|h\b|uhr|hours?\b|hrs?\b|min))/i;
const CLEAR = /\d\s*(?:am|pm|a\.m|p\.m)\b|\b(morning|evening|afternoon|night|tonight|noon|midnight|after work|before work|lunch|breakfast|dinner)\b/i;

export type Ambiguous = { said: string; am: string; pm: string };

export function ambiguousTime(text: string): Ambiguous | null {
  if (CLEAR.test(text)) return null;
  const hit = BARE_TIME.exec(text);
  if (!hit) return null;
  const hour = Number(hit[1] ?? hit[3] ?? hit[5]);
  const minute = hit[2] ?? hit[4] ?? '00';
  const pad = (h: number) => String(h).padStart(2, '0');
  return { said: hit[0].trim(), am: `${pad(hour)}:${minute}`, pm: `${pad(hour + 12)}:${minute}` };
}

type Shown = { start: string; end: string; title: string };

/** What on the calendar the span overlaps, earliest first. */
export function overlapping(events: Shown[], span: Span): Shown[] {
  const [s, e] = [Date.parse(span.startISO), Date.parse(span.endISO)];
  return events.filter((b) => Date.parse(b.start) < e && Date.parse(b.end) > s).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/** "Call with Alice (18:30–19:00), Lunch (12:00–13:00)" */
export function overlapList(hits: Shown[]): string {
  const hhmm = (iso: string) => iso.slice(11, 16);
  return hits.map((b) => `${b.title.slice(0, 40)} (${hhmm(b.start)}–${hhmm(b.end)})`).join(', ');
}

/** "…it overlaps Call with Alice (18:30–19:00)" for the card, so a clash shows even if the model is silent. */
export function clashNote(busy: Shown[], span: Span): string | null {
  const hits = overlapping(busy, span);
  return hits.length ? `it's the time you asked for, but it overlaps ${overlapList(hits)}` : null;
}

/**
 * Up to two free start times ("13:00") on the span's day for a block of the
 * same length: the first one after the asked time, then the last one before
 * it. On a 15-minute grid, inside [dayStartHour, dayEndHour), never in the past.
 */
export function freeNear(events: Shown[], span: Span, nowISO: string, dayStartHour: number, dayEndHour: number): string[] {
  const STEP = 15 * 60_000;
  const s = Date.parse(span.startISO);
  const len = Date.parse(span.endISO) - s;
  const day = Math.floor(s / 86_400_000) * 86_400_000;
  const lo = Math.max(day + dayStartHour * 3_600_000, Math.ceil(Date.parse(nowISO) / STEP) * STEP);
  const hi = day + dayEndHour * 3_600_000;
  const iv = events.map((b) => [Date.parse(b.start), Date.parse(b.end)]);
  const free = (c: number) => c >= lo && c + len <= hi && !iv.some(([a, b]) => a < c + len && b > c);
  const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);
  const out: string[] = [];
  for (let c = s + STEP; c + len <= hi; c += STEP) if (free(c)) { out.push(hhmm(c)); break; }
  for (let c = s - STEP; c >= lo; c -= STEP) if (free(c)) { out.push(hhmm(c)); break; }
  return out;
}
