import type { ExpandedItem, ScheduleConflict } from "./types";

/** Build a structured, never-silent conflict report with at least one concrete fallback option. */
export function buildConflict(item: ExpandedItem, reason: string): ScheduleConflict {
  const fallbacks: { label: string; action: string }[] = [];

  if (item.dueBy) {
    fallbacks.push({ label: "Push the deadline back", action: `extend-due-by:${item.refId}` });
  }
  if (!item.splittable) {
    fallbacks.push({ label: "Allow splitting into smaller sessions", action: `allow-split:${item.refId}` });
  }
  fallbacks.push({ label: "Shorten the duration", action: `shorten-duration:${item.refId}` });
  fallbacks.push({ label: "Schedule after the current horizon", action: `extend-horizon:${item.refId}` });

  return {
    id: `conflict-${item.refId}`,
    refId: item.refId,
    message: `Couldn't find room for "${item.title}" (${item.durationMin} min): ${reason}`,
    fallbacks,
  };
}
