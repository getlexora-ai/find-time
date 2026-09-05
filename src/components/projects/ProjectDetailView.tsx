"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Icon } from "@/components/ui/Icon";
import { Card } from "@/components/ui/Card";
import { ProgressMeter } from "@/components/ui/ProgressMeter";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import { useProjects } from "@/lib/hooks/useProjects";
import { useTasks } from "@/lib/hooks/useTasks";
import { TaskRow } from "@/components/tasks/TaskRow";
import { formatDuration, totalDurationMin } from "@/components/tasks/taskUtils";

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: tasks, isLoading: tasksLoading } = useTasks();

  const isLoading = projectsLoading || tasksLoading;
  const project = projects?.find((p) => p.id === projectId);
  const projectTasks = (tasks ?? []).filter((t) => t.projectId === projectId);

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6 lg:p-8">
        <SkeletonBlock className="h-6 w-32" />
        <SkeletonBlock className="h-28 w-full" />
        <SkeletonBlock className="h-64 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6 lg:p-8">
        <BackLink />
        <EmptyState
          icon="solar:folder-with-files-linear"
          eyebrow="Not found"
          message="This project no longer exists — it may have been deleted."
        />
      </div>
    );
  }

  const done = projectTasks.filter((t) => t.status === "done");
  const remaining = projectTasks.filter((t) => t.status !== "done");
  const pct = projectTasks.length > 0 ? Math.round((done.length / projectTasks.length) * 100) : 0;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 lg:p-8">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-full"
            style={{ backgroundColor: `var(--color-${project.color}, #CCFF00)` }}
          />
          <div>
            <h1 className="font-mono text-2xl font-medium tracking-tight text-white">{project.name}</h1>
            {project.description && <p className="mt-1 font-mono text-sm text-white/55">{project.description}</p>}
          </div>
        </div>
        {project.targetDate && (
          <div className="flex items-center gap-1.5 font-mono text-xs text-white/45">
            <Icon name="solar:calendar-minimalistic-linear" size={13} />
            Target {format(new Date(project.targetDate), "MMM d, yyyy")}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Tasks" value={String(projectTasks.length).padStart(2, "0")} />
        <Stat label="Done" value={String(done.length).padStart(2, "0")} />
        <Stat label="Remaining" value={String(remaining.length).padStart(2, "0")} />
        <Stat label="Est. work left" value={formatDuration(totalDurationMin(remaining))} />
      </div>

      <Card>
        <ProgressMeter value={pct} label="Progress" delta={`${pct}%`} />
      </Card>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="px-1 font-mono text-xs uppercase tracking-widest text-white/50">To do</p>
          {remaining.length === 0 ? (
            <EmptyState icon="solar:checklist-minimalistic-linear" eyebrow="All clear" message="No open tasks in this project." />
          ) : (
            <Card tone="paper" className="divide-y divide-ink/10 p-0">
              {remaining.map((task) => (
                <TaskRow key={task.id} task={task} showProject={false} />
              ))}
            </Card>
          )}
        </div>

        {done.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="px-1 font-mono text-xs uppercase tracking-widest text-white/50">Done</p>
            <Card tone="paper" className="divide-y divide-ink/10 p-0">
              {done.map((task) => (
                <TaskRow key={task.id} task={task} showProject={false} />
              ))}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="font-mono text-xs uppercase tracking-widest text-white/50">{label}</p>
      <p className="font-mono text-xl font-medium text-white">{value}</p>
    </Card>
  );
}

function BackLink() {
  return (
    <Link
      href="/app/projects"
      className="flex w-fit items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-white/50 hover:text-white"
    >
      <Icon name="solar:arrow-left-linear" size={14} />
      Back to projects
    </Link>
  );
}
