"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/ui/Icon";
import { Chip } from "@/components/ui/Chip";
import { useToast } from "@/components/ui/Toast";
import { useUpdateTask } from "@/lib/hooks/useTasks";
import type { Project, Task } from "@/lib/types";
import {
  categoryLabel,
  categoryTone,
  formatDuration,
  isOverdue,
  priorityTone,
  schedulingState,
  taskDateIso,
} from "@/components/tasks/taskUtils";
import { SchedulingPill } from "@/components/tasks/SchedulingPill";

export function TaskRow({
  task,
  project,
  showProject = true,
  className,
}: {
  task: Task;
  project?: Project | null;
  showProject?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const updateTask = useUpdateTask();
  const done = task.status === "done";
  const dateIso = taskDateIso(task);
  const overdue = isOverdue(task);

  const toggleDone = () => {
    updateTask.mutate(
      {
        id: task.id,
        patch: done
          ? { status: "backlog", completedAt: null }
          : { status: "done", completedAt: new Date().toISOString() },
      },
      {
        onSuccess: () => {
          push({ message: done ? "Task reopened" : "Task marked done", variant: "success" });
        },
      },
    );
  };

  const openDetail = () => router.push(`/app/tasks/${task.id}`);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetail();
        }
      }}
      className={cn(
        "flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-paper-hi",
        className,
      )}
    >
      <button
        type="button"
        aria-label={done ? "Mark as not done" : "Mark as done"}
        onClick={(e) => {
          e.stopPropagation();
          toggleDone();
        }}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          done ? "border-lime bg-lime" : "border-ink/25 hover:border-ink/50",
        )}
      >
        {done && <Icon name="solar:check-circle-linear" size={13} className="text-ink" />}
      </button>

      {showProject && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: project ? `var(--color-${project.color}, #C8C8FF)` : "transparent" }}
          title={project?.name}
        />
      )}

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate font-mono text-sm",
            done ? "text-ink/40 line-through" : "text-ink",
          )}
        >
          {task.title}
        </p>
      </div>

      <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
        {task.category !== "general" && (
          <Chip tone={categoryTone(task.category)}>{categoryLabel(task.category)}</Chip>
        )}
        <Chip tone={priorityTone(task.priority)}>{task.priority}</Chip>
      </div>

      <div className="hidden shrink-0 items-center gap-1 font-mono text-xs text-ink/45 md:flex">
        <Icon name="solar:clock-circle-linear" size={13} />
        {formatDuration(task.durationMin)}
      </div>

      {dateIso && (
        <div
          className={cn(
            "hidden shrink-0 items-center gap-1 font-mono text-xs md:flex",
            overdue ? "text-ember" : "text-ink/45",
          )}
        >
          <Icon name={overdue ? "solar:danger-triangle-linear" : "solar:calendar-minimalistic-linear"} size={13} />
          {format(new Date(dateIso), "MMM d")}
        </div>
      )}

      <SchedulingPill state={schedulingState(task)} className="hidden sm:inline-flex" />
    </div>
  );
}
