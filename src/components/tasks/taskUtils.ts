import { endOfToday, isBefore, isThisWeek } from "date-fns";
import type { Task, TaskPriority } from "@/lib/types";

export type SchedulingState = "UNSCHEDULED" | "SCHEDULED" | "DONE";

export function schedulingState(task: Task): SchedulingState {
  if (task.status === "done") return "DONE";
  if (task.status === "scheduled" || task.status === "in-progress" || task.scheduledEventId) {
    return "SCHEDULED";
  }
  return "UNSCHEDULED";
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** dueBy is the hard deadline; preferBy is the soft one. dueBy wins when both are set. */
export function taskDateIso(task: Task): string | null {
  return task.dueBy ?? task.preferBy ?? null;
}

export function isOverdue(task: Task): boolean {
  if (task.status === "done") return false;
  const iso = taskDateIso(task);
  if (!iso) return false;
  return isBefore(new Date(iso), endOfToday()) && !isSameDayAsToday(iso);
}

function isSameDayAsToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

export interface TaskBuckets {
  today: Task[];
  thisWeek: Task[];
  later: Task[];
  noDate: Task[];
  done: Task[];
}

function bucketKey(task: Task): keyof TaskBuckets {
  if (task.status === "done") return "done";
  const iso = taskDateIso(task);
  if (!iso) return "noDate";
  const d = new Date(iso);
  if (isBefore(d, endOfToday())) return "today"; // includes overdue — surface it, don't bury it
  if (isThisWeek(d, { weekStartsOn: 1 })) return "thisWeek";
  return "later";
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const da = taskDateIso(a);
    const db = taskDateIso(b);
    if (da && db) {
      const diff = new Date(da).getTime() - new Date(db).getTime();
      if (diff !== 0) return diff;
    } else if (da && !db) return -1;
    else if (!da && db) return 1;
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  });
}

export function groupTasksByBucket(tasks: Task[]): TaskBuckets {
  const buckets: TaskBuckets = { today: [], thisWeek: [], later: [], noDate: [], done: [] };
  for (const task of tasks) {
    buckets[bucketKey(task)].push(task);
  }
  buckets.today = sortTasks(buckets.today);
  buckets.thisWeek = sortTasks(buckets.thisWeek);
  buckets.later = sortTasks(buckets.later);
  buckets.noDate = sortTasks(buckets.noDate);
  buckets.done = [...buckets.done].sort(
    (a, b) => new Date(b.completedAt ?? b.updatedAt).getTime() - new Date(a.completedAt ?? a.updatedAt).getTime(),
  );
  return buckets;
}

export function totalDurationMin(tasks: Task[]): number {
  return tasks.reduce((sum, t) => sum + t.durationMin, 0);
}

type ChipTone = "lime" | "periwinkle" | "ember" | "amber" | "paper" | "outline";

const CATEGORY_TONE: Record<string, ChipTone> = {
  "deep-work": "lime",
  design: "periwinkle",
  research: "ember",
  meeting: "outline",
  admin: "amber",
  learning: "lime",
  break: "paper",
  other: "outline",
  general: "outline",
};

export function categoryTone(category: string): ChipTone {
  return CATEGORY_TONE[category] ?? "outline";
}

export function categoryLabel(category: string): string {
  return category.replace(/-/g, " ");
}

const PRIORITY_TONE: Record<TaskPriority, ChipTone> = {
  high: "ember",
  medium: "amber",
  low: "outline",
};

export function priorityTone(priority: TaskPriority): ChipTone {
  return PRIORITY_TONE[priority];
}
