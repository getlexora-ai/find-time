"use client";

import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import type { Project, TaskPriority } from "@/lib/types";

export type TasksView = "list" | "backlog";

const views: { id: TasksView; label: string; icon: string }[] = [
  { id: "list", label: "List", icon: "solar:checklist-minimalistic-linear" },
  { id: "backlog", label: "Backlog", icon: "solar:box-minimalistic-linear" },
];

export function TasksToolbar({
  view,
  onViewChange,
  priorityFilter,
  onPriorityFilterChange,
  projectFilter,
  onProjectFilterChange,
  projects,
  onNewTask,
}: {
  view: TasksView;
  onViewChange: (v: TasksView) => void;
  priorityFilter: TaskPriority | "all";
  onPriorityFilterChange: (v: TaskPriority | "all") => void;
  projectFilter: string;
  onProjectFilterChange: (v: string) => void;
  projects: Project[];
  onNewTask: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1 rounded-control border border-white/10 bg-white/5 p-1">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onViewChange(v.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-control px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors",
              view === v.id ? "bg-lime text-ink" : "text-white/60 hover:text-white",
            )}
          >
            <Icon name={v.icon} size={14} />
            {v.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={priorityFilter}
          onChange={(e) => onPriorityFilterChange(e.target.value as TaskPriority | "all")}
          className="!h-9 w-auto min-w-28"
          aria-label="Filter by priority"
        >
          <option value="all">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
        <Select
          value={projectFilter}
          onChange={(e) => onProjectFilterChange(e.target.value)}
          className="!h-9 w-auto min-w-32"
          aria-label="Filter by project"
        >
          <option value="all">All projects</option>
          <option value="none">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Button size="sm" icon="solar:add-circle-linear" onClick={onNewTask}>
          New task
        </Button>
      </div>
    </div>
  );
}
