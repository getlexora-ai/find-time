"use client";

import * as React from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { useToast } from "@/components/ui/Toast";
import { useUpdateTask } from "@/lib/hooks/useTasks";
import { emptyStates } from "@/content/voice";
import type { CalendarEvent, Project, Task } from "@/lib/types";
import { ScheduleTimelineRow } from "@/components/dashboard/ScheduleTimelineRow";
import { AddTaskModal } from "@/components/dashboard/AddTaskModal";

export function TodayScheduleCard({
  selectedDate,
  dayEvents,
  tasks,
  projects,
  loading,
}: {
  selectedDate: Date;
  dayEvents: CalendarEvent[];
  tasks: Task[] | undefined;
  projects: Project[] | undefined;
  loading?: boolean;
}) {
  const { push } = useToast();
  const updateTask = useUpdateTask();
  const [addOpen, setAddOpen] = React.useState(false);

  const tasksById = React.useMemo(() => {
    const map = new Map<string, Task>();
    tasks?.forEach((t) => map.set(t.id, t));
    return map;
  }, [tasks]);

  const projectsById = React.useMemo(() => {
    const map = new Map<string, Project>();
    projects?.forEach((p) => map.set(p.id, p));
    return map;
  }, [projects]);

  const handleToggleTask = (task: Task) => {
    const done = task.status === "done";
    updateTask.mutate(
      {
        id: task.id,
        patch: done
          ? { status: "scheduled", completedAt: null }
          : { status: "done", completedAt: new Date().toISOString() },
      },
      {
        onSuccess: () => {
          if (!done) {
            push({ message: `"${task.title}" marked done`, variant: "success" });
          }
        },
        onError: () => push({ message: "Couldn't update that task", variant: "alert" }),
      },
    );
  };

  return (
    <Panel
      title="Today's schedule"
      tone="paper"
      eyebrowChip={
        <span className="rounded-full bg-lime px-2 py-1 font-mono text-micro uppercase tracking-wider text-ink">
          AI balanced
        </span>
      }
      actions={
        <Button size="sm" variant="paper" icon="solar:add-circle-linear" onClick={() => setAddOpen(true)}>
          Add task
        </Button>
      }
    >
      <p className="-mt-2 mb-4 font-mono text-xs text-ink/45">
        Built around your energy and deadlines.
      </p>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <SkeletonBlock key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : dayEvents.length === 0 ? (
        <EmptyState
          icon={emptyStates.tasks.icon}
          eyebrow={emptyStates.tasks.eyebrow}
          message={emptyStates.tasks.message}
          ctaLabel={emptyStates.tasks.ctaLabel}
          onCta={() => setAddOpen(true)}
        />
      ) : (
        <div className="divide-y divide-ink/10">
          {dayEvents.map((event) => (
            <ScheduleTimelineRow
              key={event.id}
              event={event}
              linkedTask={event.taskId ? tasksById.get(event.taskId) : undefined}
              project={event.projectId ? projectsById.get(event.projectId) : undefined}
              onToggleTask={handleToggleTask}
            />
          ))}
        </div>
      )}

      <AddTaskModal
        open={addOpen}
        onOpenChange={setAddOpen}
        selectedDate={selectedDate}
        dayEvents={dayEvents}
      />
    </Panel>
  );
}
