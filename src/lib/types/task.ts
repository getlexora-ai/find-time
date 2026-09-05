export type TaskStatus = "backlog" | "scheduled" | "in-progress" | "done" | "archived";
export type TaskPriority = "low" | "medium" | "high";
export type TaskSourceType = "native" | "signal" | "todoist" | "google-tasks" | "notion" | "import";

export interface Task {
  id: string;
  userId: string;
  projectId: string | null;
  title: string;
  notes: string | null;
  status: TaskStatus;
  durationMin: number;
  durationIsEstimate: boolean;
  actualDurationMin: number | null;
  dueBy: string | null;
  preferBy: string | null;
  priority: TaskPriority;
  requiresFocus: boolean;
  preferredWindow: "morning" | "afternoon" | "evening" | null;
  splittable: boolean;
  minChunkMin: number;
  category: string;
  labels: string[];
  scheduledEventId: string | null;
  sourceType: TaskSourceType;
  sourceAccountId: string | null;
  sourceExternalId: string | null;
  sourceSignalId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  color: string;
  description: string | null;
  status: "active" | "paused" | "done";
  targetDate: string | null;
  order: number;
  createdAt: string;
}
