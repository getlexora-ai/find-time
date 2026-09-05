import type { ScheduleItem } from "../types/ai";
import type { Task } from "../types/task";
import type { ExpandedItem } from "./types";

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Expand a `ScheduleRequest`'s items into everything the scheduler needs. When an item names a
 * `taskId` and a matching `Task` is supplied (via `ScheduleContext.tasks`), its pack-only fields
 * (`splittable`, `minChunkMin`, `requiresFocus`, `category`) are merged in. An item with no
 * matching task defaults to safe pack-only placement (non-splittable, `minChunkMin` = the full
 * duration, no focus requirement) — never assumes it's OK to split.
 */
export function expandItems(items: ScheduleItem[], tasks: Task[] = []): ExpandedItem[] {
  const taskById = new Map(tasks.map((t) => [t.id, t] as const));
  return items.map((item) => {
    const task = item.taskId ? (taskById.get(item.taskId) ?? null) : null;
    return {
      refId: item.refId,
      taskId: item.taskId ?? task?.id ?? null,
      title: item.title || task?.title || "Untitled",
      durationMin: item.durationMin,
      dueBy: parseDate(item.dueBy ?? task?.dueBy ?? null),
      preferBy: parseDate(item.preferBy ?? task?.preferBy ?? null),
      priority: item.priority ?? task?.priority ?? "medium",
      preferredWindow: item.preferredWindow ?? task?.preferredWindow ?? null,
      requiresFocus: task?.requiresFocus ?? false,
      splittable: task?.splittable ?? false,
      minChunkMin: task?.minChunkMin ?? item.durationMin,
      category: task?.category ?? "other",
      sourceTask: task,
    };
  });
}
