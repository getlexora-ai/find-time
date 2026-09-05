import type { Task, TaskPriority } from "../types/task";

/** The scheduler always thinks in 15-minute increments — the grid every placement snaps to. */
export const GRID_MINUTES = 15;

/** A free-time (or, when used as "busy", occupied-time) span. */
export interface FreeInterval {
  start: Date;
  end: Date;
}

/**
 * A `ScheduleItem` enriched with everything the scheduler needs to place it: the pack-only
 * fields (`splittable`, `minChunkMin`, `requiresFocus`) only exist on `Task`, so when the
 * caller passes a `tasks` lookup (via `ScheduleContext.tasks`, matched on `ScheduleItem.taskId`)
 * those are merged in. Without a matching task, an item defaults to non-splittable pack-only
 * placement, which is always the safe choice.
 */
export interface ExpandedItem {
  refId: string;
  taskId: string | null;
  title: string;
  durationMin: number;
  /** Hard deadline — the block must finish by this instant, and may displace a soft focus window to do so. */
  dueBy: Date | null;
  /** Soft target — influences scoring/urgency but is never allowed to displace a focus window. */
  preferBy: Date | null;
  priority: TaskPriority;
  preferredWindow: "morning" | "afternoon" | "evening" | null;
  requiresFocus: boolean;
  splittable: boolean;
  minChunkMin: number;
  category: string;
  sourceTask: Task | null;
}

/** One placed (or proposed) block of time for a `ScheduleItem`/`Task`. Maps 1:1 to what would become an `AISuggestion`/draft `CalendarEvent`. */
export interface ScheduledBlock {
  id: string;
  refId: string;
  taskId: string | null;
  title: string;
  start: string;
  end: string;
  /** 0-based chunk index when a splittable task was placed across multiple sessions. */
  chunkIndex: number;
  /** Total chunk count for this refId (1 unless split). */
  chunkCount: number;
  score: number;
  rationale: string;
  /** True when placing this block required using time inside a soft focus window to meet a hard deadline. Always recorded, never silent. */
  displacedFocus: boolean;
  /** True for scheduler-placed, still-flexible blocks — eligible to be bumped by backtracking for a higher-constraint item. False for blocks carried over untouched from a previous plan during incremental re-plan. */
  movable: boolean;
}

export interface SchedulePlan {
  blocks: ScheduledBlock[];
}

export interface ScheduleConflict {
  id: string;
  refId: string;
  message: string;
  fallbacks: { label: string; action: string }[];
}

export interface ScheduleResult {
  plan: SchedulePlan;
  conflicts: ScheduleConflict[];
}

export interface ScheduleContext {
  /** Enrichment source for splittable/minChunkMin/requiresFocus/category, matched on `ScheduleItem.taskId`. */
  tasks?: Task[];
  /** Overrides "now" for deterministic tests/urgency scoring; defaults to `new Date()`. */
  now?: string;
  /** Start of the scheduling horizon; defaults to `now`. */
  horizonStart?: string;
  /** Length of the scheduling horizon in days; defaults to `profile.planningHorizonDays`. */
  horizonDays?: number;
  /** A previously computed plan, for incremental re-plan. */
  previousPlan?: SchedulePlan;
  /**
   * When set together with `previousPlan`, only items whose `refId` is in this set are
   * recomputed — every other block from `previousPlan` is kept exactly as-is (and still
   * occupies capacity for the recomputed neighborhood). Omit for a full re-plan.
   */
  replanOnly?: Iterable<string>;
}
