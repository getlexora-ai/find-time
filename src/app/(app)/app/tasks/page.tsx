"use client";

import * as React from "react";
import { useTasks } from "@/lib/hooks/useTasks";
import { useProjects } from "@/lib/hooks/useProjects";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import { emptyStates } from "@/content/voice";
import { TasksToolbar, type TasksView } from "@/components/tasks/TasksToolbar";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { TaskSection } from "@/components/tasks/TaskSection";
import { BacklogBanner } from "@/components/tasks/BacklogBanner";
import { TaskRow } from "@/components/tasks/TaskRow";
import { Card } from "@/components/ui/Card";
import { groupTasksByBucket, totalDurationMin } from "@/components/tasks/taskUtils";
import type { TaskPriority } from "@/lib/types";

export default function TasksPage() {
  const { data: tasks, isLoading } = useTasks();
  const { data: projects } = useProjects();

  const [view, setView] = React.useState<TasksView>("list");
  const [priorityFilter, setPriorityFilter] = React.useState<TaskPriority | "all">("all");
  const [projectFilter, setProjectFilter] = React.useState<string>("all");
  const [modalOpen, setModalOpen] = React.useState(false);

  const projectsById = React.useMemo(
    () => new Map((projects ?? []).map((p) => [p.id, p])),
    [projects],
  );

  const filtered = React.useMemo(() => {
    return (tasks ?? []).filter((t) => {
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (projectFilter === "none" && t.projectId) return false;
      if (projectFilter !== "all" && projectFilter !== "none" && t.projectId !== projectFilter) return false;
      return true;
    });
  }, [tasks, priorityFilter, projectFilter]);

  const buckets = React.useMemo(() => groupTasksByBucket(filtered), [filtered]);
  const backlogTasks = React.useMemo(() => filtered.filter((t) => t.status === "backlog"), [filtered]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 lg:p-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-lime">Tasks</p>
        <h1 className="mt-1 font-mono text-2xl font-medium tracking-tight text-white">Everything on your plate</h1>
      </div>

      <TasksToolbar
        view={view}
        onViewChange={setView}
        priorityFilter={priorityFilter}
        onPriorityFilterChange={setPriorityFilter}
        projectFilter={projectFilter}
        onProjectFilterChange={setProjectFilter}
        projects={projects ?? []}
        onNewTask={() => setModalOpen(true)}
      />

      {isLoading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {!isLoading && (tasks?.length ?? 0) === 0 && (
        <EmptyState
          icon={emptyStates.tasks.icon}
          eyebrow={emptyStates.tasks.eyebrow}
          message={emptyStates.tasks.message}
          ctaLabel={emptyStates.tasks.ctaLabel}
          onCta={() => setModalOpen(true)}
        />
      )}

      {!isLoading && (tasks?.length ?? 0) > 0 && filtered.length === 0 && (
        <EmptyState
          icon="solar:filter-linear"
          eyebrow="No matches"
          message="No tasks match these filters — try widening them."
        />
      )}

      {!isLoading && filtered.length > 0 && view === "list" && (
        <div className="flex flex-col gap-6">
          <TaskSection label="Today" tasks={buckets.today} projectsById={projectsById} />
          <TaskSection label="This week" tasks={buckets.thisWeek} projectsById={projectsById} />
          <TaskSection label="Later" tasks={buckets.later} projectsById={projectsById} />
          <TaskSection label="No date" tasks={buckets.noDate} projectsById={projectsById} />
          <TaskSection label="Done" tasks={buckets.done} projectsById={projectsById} />
        </div>
      )}

      {!isLoading && filtered.length > 0 && view === "backlog" && (
        <div className="flex flex-col gap-4">
          <BacklogBanner count={backlogTasks.length} totalMin={totalDurationMin(backlogTasks)} />
          {backlogTasks.length === 0 ? (
            <EmptyState
              icon="solar:box-minimalistic-linear"
              eyebrow="Backlog clear"
              message="Nothing unscheduled — every task has a home."
            />
          ) : (
            <Card tone="paper" className="divide-y divide-ink/10 p-0">
              {backlogTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  project={task.projectId ? projectsById.get(task.projectId) : null}
                />
              ))}
            </Card>
          )}
        </div>
      )}

      <TaskFormModal open={modalOpen} onOpenChange={setModalOpen} projects={projects ?? []} />
    </div>
  );
}
