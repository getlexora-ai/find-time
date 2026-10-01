/**
 * Free-time math (ported from find-time-agent's slots.ts — on the ba-calendar
 * benchmark the model alone found the right slot 26% of the time, with this
 * tool 96%). Minutes since local midnight throughout.
 */

export type Span = [number, number];

/** Slots of `duration` inside [earliest, latest], free for `buffer` either side, earliest first. */
export function findSlots({
  free,
  duration,
  buffer = 0,
  earliest = 0,
  latest = 24 * 60,
  step = 15,
}: {
  free: Span[];
  duration: number;
  buffer?: number;
  earliest?: number;
  latest?: number;
  step?: number;
}): Span[] {
  const slots: Span[] = [];
  for (let s = Math.ceil(earliest / step) * step; s + duration <= latest; s += step) {
    const e = s + duration;
    if (free.some(([a, b]) => a <= s - buffer && b >= e + buffer)) slots.push([s, e]);
  }
  return slots;
}

/** Busy spans (minutes, may overlap) → the free spans of the day. */
export function freeFromBusy(busy: Span[]): Span[] {
  const sorted = [...busy].sort((a, b) => a[0] - b[0]);
  const free: Span[] = [];
  let cursor = 0;
  for (const [s, e] of sorted) {
    if (s > cursor) free.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < 1440) free.push([cursor, 1440]);
  return free;
}
