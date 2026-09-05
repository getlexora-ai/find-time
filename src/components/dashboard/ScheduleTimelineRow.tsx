"use client";

import { format } from "date-fns";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/ui/Icon";
import type { CalendarEvent, Project, Task } from "@/lib/types";
import { categoryMeta, projectDotClass } from "@/components/dashboard/categoryMeta";
import { eventDurationMin } from "@/components/dashboard/utils";

export function ScheduleTimelineRow({
  event,
  linkedTask,
  project,
  onToggleTask,
}: {
  event: CalendarEvent;
  linkedTask?: Task;
  project?: Project;
  onToggleTask?: (task: Task) => void;
}) {
  const meta = categoryMeta[event.category];
  const durationMin = eventDurationMin(event);
  const done = linkedTask?.status === "done";

  if (event.itemType === "break") {
    return (
      <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] sm:grid-cols-[4.5rem_minmax(0,1fr)]">
        <div className="border-r border-ink/10 px-3 py-5 text-right font-mono text-xs text-ink/40 sm:px-4">
          {format(new Date(event.start), "HH:mm")}
        </div>
        <div className="p-3 sm:p-4">
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-ink/15 bg-paper-sunk p-4 text-ink/45">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white">
              <Icon name={meta.icon} size={18} />
            </div>
            <div>
              <p className="font-mono text-sm text-ink/70">{event.title}</p>
              {event.description && <p className="mt-1 font-mono text-xs">{event.description}</p>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const dotClass = project ? (projectDotClass[project.color] ?? meta.dotClass) : meta.dotClass;
  const metaLabel = project?.name ?? meta.label;

  return (
    <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] sm:grid-cols-[4.5rem_minmax(0,1fr)]">
      <div className="border-r border-ink/10 px-3 py-5 text-right font-mono text-xs text-ink/40 sm:px-4">
        {format(new Date(event.start), "HH:mm")}
      </div>
      <div className="p-3 sm:p-4">
        <div className="group flex gap-3 rounded-xl border border-ink/10 bg-white p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
          {event.itemType === "task" && (
            <button
              className={cn(
                "task-check mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors duration-150",
                done ? "border-lime bg-lime" : "border-ink/25 bg-white hover:border-blue",
              )}
              aria-label={done ? "Mark task not done" : "Complete task"}
              onClick={() => linkedTask && onToggleTask?.(linkedTask)}
            >
              {done && <Icon name="solar:check-read-linear" size={13} className="text-ink" />}
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p
                  className={cn(
                    "font-mono text-sm font-medium text-ink",
                    done && "text-ink/40 line-through",
                  )}
                >
                  {event.title}
                </p>
                {event.description && (
                  <p className="mt-1 font-mono text-xs leading-relaxed text-ink/45">
                    {event.description}
                  </p>
                )}
              </div>
              <span className={cn("shrink-0 rounded-full px-2 py-1 font-mono text-micro", meta.chipClass)}>
                {meta.label}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 font-mono text-xs text-ink/40">
              <span className="flex items-center gap-1.5">
                <Icon name="solar:clock-circle-linear" size={14} />
                {durationMin} min
              </span>
              <span className="flex items-center gap-1.5">
                <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
                {metaLabel}
              </span>
              {event.flexibility === "protected" && (
                <span className="flex items-center gap-1.5 text-ink/30">
                  <Icon name="solar:shield-check-linear" size={14} />
                  Protected
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
