/**
 * Deterministic slot finder. The LLM (src/server/ai/anthropic.ts) turns the
 * user's sentence into a `FindSpec`; this function does the actual placement so
 * the model can never hallucinate a double-book. Pure — no I/O, no clock.
 *
 * Times are ISO 8601 strings treated as UTC wall-clock, matching the rest of the
 * app (src/calendar/api-adapter.ts `partsToIso` writes `...T HH:MM:00.000Z`, and
 * the server runs UTC). "Hour of day" therefore means the UTC hour.
 *
 * Server-only, but dependency-free, so the .check.mjs can import it directly.
 */

export type Busy = { start: string; end: string };
export type Slot = { startISO: string; endISO: string };

export type FindSpec = {
  durationMin: number;
  count: number;
  /** search window, inclusive start / exclusive end */
  earliestISO: string;
  latestISO: string;
  /** local (UTC) hour a block may start at the earliest, 0–23 */
  dayStartHour: number;
  /** local (UTC) hour a block must end by at the latest, 1–24 */
  dayEndHour: number;
  /** minutes kept clear between two newly-placed blocks (a new block may still
   *  butt right up against an existing calendar event — that is normal) */
  bufferMin: number;
};

const MIN = 60_000;
const DAY = 86_400_000;
const STEP_MIN = 15;

function iso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, '.000Z');
}

/** Start of the UTC day containing `ms`. */
function dayStart(ms: number): number {
  return Math.floor(ms / DAY) * DAY;
}

export function findFreeSlots(busy: Busy[], spec: FindSpec): Slot[] {
  const durMs = Math.max(1, Math.round(spec.durationMin)) * MIN;
  const bufMs = Math.max(0, Math.round(spec.bufferMin)) * MIN;
  const stepMs = STEP_MIN * MIN;
  const count = Math.max(1, Math.round(spec.count));

  const earliest = Date.parse(spec.earliestISO);
  const latest = Date.parse(spec.latestISO);
  if (!Number.isFinite(earliest) || !Number.isFinite(latest) || latest <= earliest) return [];

  // Existing events block their exact span (no buffer — abutting a meeting is fine).
  const blocked = busy
    .map((b) => ({ s: Date.parse(b.start), e: Date.parse(b.end) }))
    .filter((b) => Number.isFinite(b.s) && Number.isFinite(b.e) && b.e > earliest && b.s < latest)
    .sort((a, b) => a.s - b.s);

  const placed: Slot[] = [];
  const placedIntervals: { s: number; e: number }[] = [];

  const hitsBlocked = (s: number, e: number) =>
    blocked.some((b) => s < b.e && e > b.s) ||
    placedIntervals.some((b) => s < b.e && e > b.s);

  for (let day = dayStart(earliest); day <= latest && placed.length < count; day += DAY) {
    const windowStart = Math.max(earliest, day + spec.dayStartHour * 60 * MIN);
    const windowEnd = Math.min(latest, day + spec.dayEndHour * 60 * MIN);
    // Align the first candidate to the 15-minute grid.
    let c = Math.ceil(windowStart / stepMs) * stepMs;

    while (c + durMs <= windowEnd && placed.length < count) {
      if (hitsBlocked(c, c + durMs)) {
        c += stepMs;
        continue;
      }
      placed.push({ startISO: iso(c), endISO: iso(c + durMs) });
      placedIntervals.push({ s: c, e: c + durMs + bufMs });
      c += durMs + bufMs;
    }
  }

  return placed;
}
