/**
 * Time away — "I'm in Copenhagen from the 17th evening till the 22nd" — as
 * calendar blocks.
 *
 * The model reads the sentence and hands back a start and an end. Everything
 * after that is here, and deterministic: the span is checked, then cut into one
 * block per day. It has to be cut because the calendar stores a block as a date
 * plus two clock times (src/calendar/api-adapter.ts), so one five-day row would
 * draw as 18:00–18:00 on the first day and nothing on the rest.
 *
 * Times are wall-clock with a `Z` suffix, like every other time in the app:
 * "18:00" is 18:00 on the user's calendar, whatever offset the model attaches.
 */

export const MAX_TIME_OFF_DAYS = 60;
export const TIME_OFF_LOOKAHEAD_DAYS = 366;

const DAY_MS = 86_400_000;

export type Span = { startISO: string; endISO: string };

export type TimeOffCheck = { ok: true; span: Span } | { ok: false; reason: string };

/**
 * Read a model-supplied time as wall-clock, dropping any offset. A date with no
 * time is midnight at the start of that day — or, for an end, the midnight
 * after it, since "the 17th to the 22nd" includes the 22nd.
 */
function wallClock(raw: unknown, isEnd: boolean): number | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(raw.trim());
  if (!m) return null;
  const ms = Date.parse(`${m[1]}T${m[2] ?? '00'}:${m[3] ?? '00'}:00.000Z`);
  if (!Number.isFinite(ms)) return null;
  return m[2] === undefined && isEnd ? ms + DAY_MS : ms;
}

const toIso = (ms: number) => new Date(ms).toISOString();

export function checkTimeOff(startRaw: unknown, endRaw: unknown, nowISO: string): TimeOffCheck {
  const start = wallClock(startRaw, false);
  const end = wallClock(endRaw, true);
  if (start === null || end === null) {
    return { ok: false, reason: "I couldn't tell exactly when you're away. Which dates should I block?" };
  }
  if (end <= start) {
    return { ok: false, reason: 'That ends before it starts. Which dates are you away?' };
  }
  const now = Date.parse(nowISO);
  const today = Date.parse(`${nowISO.slice(0, 10)}T00:00:00.000Z`);
  if (end <= now) {
    return { ok: false, reason: "Those dates are already over. Did you mean a future date?" };
  }
  if (start > now + TIME_OFF_LOOKAHEAD_DAYS * DAY_MS) {
    return { ok: false, reason: "That's more than a year out. I can only block time within the next year." };
  }
  if (end - start > MAX_TIME_OFF_DAYS * DAY_MS) {
    return { ok: false, reason: `That's longer than ${MAX_TIME_OFF_DAYS} days. Can you give me a shorter stretch?` };
  }
  // Already under way ("I'm off until Friday"): block from the start of today.
  return { ok: true, span: { startISO: toIso(Math.max(start, today)), endISO: toIso(end) } };
}

/**
 * One block per calendar day the span touches. A day the span runs through
 * ends at 23:59, because the calendar has no 24:00; a span ending exactly at
 * midnight adds nothing to the day after.
 */
export function splitByDay(span: Span): Span[] {
  const start = Date.parse(span.startISO);
  const end = Date.parse(span.endISO);
  const out: Span[] = [];
  for (let day = Math.floor(start / DAY_MS) * DAY_MS; day < end; day += DAY_MS) {
    const s = Math.max(start, day);
    const e = Math.min(end, day + DAY_MS - 60_000);
    if (e > s) out.push({ startISO: toIso(s), endISO: toIso(e) });
  }
  return out;
}
