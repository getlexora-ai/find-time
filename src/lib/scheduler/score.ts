import type { SchedulerProfile } from "../types/user";
import type { ExpandedItem } from "./types";

const PRIORITY_RANK: Record<string, number> = { low: 0, medium: 0.5, high: 1 };

const WINDOW_HOURS: Record<"morning" | "afternoon" | "evening", [number, number]> = {
  morning: [5, 12],
  afternoon: [12, 17],
  evening: [17, 22],
};

export interface ScoreBreakdown {
  total: number;
  preferredWindow: number;
  focusAlignment: number;
  priority: number;
  fragmentation: number;
  deadlineUrgency: number;
}

function energyLevelAt(profile: SchedulerProfile, hour: number): number {
  if (profile.energyCurve.length === 0) return 0.5;
  let best = profile.energyCurve[0];
  let bestDist = Math.abs(best.hour - hour);
  for (const e of profile.energyCurve) {
    const dist = Math.abs(e.hour - hour);
    if (dist < bestDist) {
      best = e;
      bestDist = dist;
    }
  }
  return best.level;
}

/** Minutes of leftover free time immediately before/after the candidate within its source interval; slivers under 30 min are penalized. */
export function fragmentationMinutes(candidateStart: Date, candidateEnd: Date, intervalStart: Date, intervalEnd: Date): number {
  const before = (candidateStart.getTime() - intervalStart.getTime()) / 60_000;
  const after = (intervalEnd.getTime() - candidateEnd.getTime()) / 60_000;
  let penalty = 0;
  if (before > 0 && before < 30) penalty += 30 - before;
  if (after > 0 && after < 30) penalty += 30 - after;
  return penalty;
}

/** Weighted soft-constraint score for placing `item` at `[start, end)`, drawn from the free `[intervalStart, intervalEnd)` it was carved out of. */
export function scorePlacement(
  item: ExpandedItem,
  start: Date,
  end: Date,
  intervalStart: Date,
  intervalEnd: Date,
  profile: SchedulerProfile,
  now: Date
): ScoreBreakdown {
  const hour = start.getHours() + start.getMinutes() / 60;

  let preferredWindow = 0;
  if (item.preferredWindow) {
    const [lo, hi] = WINDOW_HOURS[item.preferredWindow];
    preferredWindow = hour >= lo && hour < hi ? 1 : 0;
  }

  const focusAlignment = item.requiresFocus ? energyLevelAt(profile, hour) : 0;

  const priority = PRIORITY_RANK[item.priority] ?? 0.5;

  const fragmentation = fragmentationMinutes(start, end, intervalStart, intervalEnd) / 60;

  let deadlineUrgency = 0;
  const deadline = item.dueBy ?? item.preferBy;
  if (deadline) {
    const totalMs = deadline.getTime() - now.getTime();
    const slotMs = end.getTime() - now.getTime();
    deadlineUrgency = totalMs > 0 ? Math.max(0, Math.min(1, 1 - slotMs / totalMs)) : 1;
  }

  const w = profile.weights;
  const total =
    w.preferredWindow * preferredWindow +
    w.focusAlignment * focusAlignment +
    w.priority * priority +
    w.deadlineUrgency * deadlineUrgency -
    w.fragmentation * fragmentation;

  return { total, preferredWindow, focusAlignment, priority, fragmentation, deadlineUrgency };
}
