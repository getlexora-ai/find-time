import { addDays } from "date-fns";
import type { CalendarEvent } from "../types/event";
import type { SchedulerProfile } from "../types/user";
import type { ScheduleRequest } from "../types/ai";
import { expandItems } from "./expand";
import { placeItems } from "./place";
import type { ScheduleContext, ScheduleResult } from "./types";

export * from "./types";
export { expandItems } from "./expand";
export {
  computeFocusIntervals,
  computeWorkHourFreeIntervals,
  intersectWindow,
  mergeIntervals,
  subtractIntervals,
} from "./capacity";
export { enumerateSlotCandidates } from "./slots";
export { scorePlacement } from "./score";
export { buildConflict } from "./conflicts";

/**
 * The deterministic scheduling engine (PLAN.md §3.4 / §8 P8):
 *
 *   expand request items → capacity scan → 15-min slot generation →
 *   most-constrained-first placement with backtracking → weighted soft-constraint
 *   scoring → conflict report.
 *
 * Pure function: no I/O, no randomness beyond the `now`/`Date.now()` default used for
 * urgency scoring (override via `context.now` for deterministic tests). Pack-only — a
 * `Task` is only ever split across chunks when its `splittable` field is true.
 *
 * Incremental re-plan: pass `context.previousPlan` + `context.replanOnly` (the set of
 * `ScheduleItem.refId`s that changed) to recompute only that neighborhood — every other
 * block from `previousPlan` is carried over untouched (and still occupies capacity).
 * Omit both for a full re-plan.
 */
export function schedule(
  calendar: CalendarEvent[],
  profile: SchedulerProfile,
  request: ScheduleRequest,
  context: ScheduleContext = {}
): ScheduleResult {
  const now = context.now ? new Date(context.now) : new Date();
  const horizonStart = context.horizonStart ? new Date(context.horizonStart) : now;
  const horizonDays = context.horizonDays ?? profile.planningHorizonDays ?? 7;
  const horizonEnd = addDays(horizonStart, horizonDays);

  const expanded = expandItems(request.items, context.tasks ?? []);

  const replanOnly = context.replanOnly ? new Set(context.replanOnly) : null;
  const previousBlocks = context.previousPlan?.blocks ?? [];

  const fixedBlocks = replanOnly ? previousBlocks.filter((b) => !replanOnly.has(b.refId)) : [];
  const itemsToPlace = replanOnly ? expanded.filter((i) => replanOnly.has(i.refId)) : expanded;

  const { blocks, conflicts } = placeItems(itemsToPlace, {
    calendar,
    profile,
    constraints: request.constraints,
    horizonStart,
    horizonEnd,
    now,
    fixedBlocks,
  });

  return {
    plan: { blocks: [...fixedBlocks, ...blocks] },
    conflicts,
  };
}
