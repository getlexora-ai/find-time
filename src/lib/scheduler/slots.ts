import { addMinutes } from "date-fns";
import { GRID_MINUTES, type FreeInterval } from "./types";

export interface SlotCandidate {
  start: Date;
  end: Date;
  /** The free interval this candidate was drawn from — used for fragmentation scoring. */
  interval: FreeInterval;
}

/** Every 15-minute-grid-aligned start time across `intervals` that can fit a block of `durationMin`. */
export function enumerateSlotCandidates(intervals: FreeInterval[], durationMin: number): SlotCandidate[] {
  const out: SlotCandidate[] = [];
  for (const interval of intervals) {
    const lengthMin = (interval.end.getTime() - interval.start.getTime()) / 60_000;
    if (lengthMin < durationMin) continue;
    const lastStart = addMinutes(interval.end, -durationMin);
    let cursor = interval.start;
    while (cursor.getTime() <= lastStart.getTime()) {
      out.push({ start: cursor, end: addMinutes(cursor, durationMin), interval });
      cursor = addMinutes(cursor, GRID_MINUTES);
    }
  }
  return out;
}
