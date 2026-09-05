"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Icon } from "@/components/ui/Icon";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useDeleteTask, useTasks, useUpdateTask } from "@/lib/hooks/useTasks";
import { useProjects } from "@/lib/hooks/useProjects";
import type { TaskPriority } from "@/lib/types";
import {
  categoryLabel,
  categoryTone,
  formatDuration,
  isOverdue,
  priorityTone,
  schedulingState,
} from "@/components/tasks/taskUtils";
import { SchedulingPill } from "@/components/tasks/SchedulingPill";

function toDateInputValue(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function TaskDetailView({ taskId }: { taskId: string }) {
  const router = useRouter();
  const { data: tasks, isLoading } = useTasks();
  const { data: projects } = useProjects();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { push } = useToast();

  const task = tasks?.find((t) => t.id === taskId);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<{
    title: string;
    durationMin: number;
    priority: TaskPriority;
    projectId: string;
    dueBy: string;
    notes: string;
  } | null>(null);

  const startEditing = () => {
    if (!task) return;
    setDraft({
      title: task.title,
      durationMin: task.durationMin,
      priority: task.priority,
      projectId: task.projectId ?? "",
      dueBy: toDateInputValue(task.dueBy),
      notes: task.notes ?? "",
    });
    setEditing(true);
  };

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6 lg:p-8">
        <SkeletonBlock className="h-6 w-32" />
        <SkeletonBlock className="h-24 w-full" />
        <SkeletonBlock className="h-64 w-full" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6 lg:p-8">
        <BackLink />
        <EmptyState
          icon="solar:checklist-minimalistic-linear"
          eyebrow="Not found"
          message="This task no longer exists — it may have been deleted."
        />
      </div>
    );
  }

  const project = task.projectId ? projects?.find((p) => p.id === task.projectId) : null;
  const done = task.status === "done";
  const overdue = isOverdue(task);

  const toggleDone = () => {
    updateTask.mutate(
      {
        id: task.id,
        patch: done
          ? { status: "backlog", completedAt: null }
          : { status: "done", completedAt: new Date().toISOString() },
      },
      { onSuccess: () => push({ message: done ? "Task reopened" : "Task marked done", variant: "success" }) },
    );
  };

  const saveEdits = () => {
    if (!draft) return;
    updateTask.mutate(
      {
        id: task.id,
        patch: {
          title: draft.title.trim() || task.title,
          durationMin: draft.durationMin,
          priority: draft.priority,
          projectId: draft.projectId || null,
          dueBy: draft.dueBy ? new Date(draft.dueBy).toISOString() : null,
          notes: draft.notes.trim() || null,
        },
      },
      {
        onSuccess: () => {
          push({ message: "Task updated", variant: "success" });
          setEditing(false);
        },
      },
    );
  };

  const remove = () => {
    if (!window.confirm(`Delete "${task.title}"? This can't be undone.`)) return;
    deleteTask.mutate(task.id, {
      onSuccess: () => {
        push({ message: "Task deleted", variant: "success" });
        router.push("/app/tasks");
      },
    });
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 lg:p-8">
      <BackLink />

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            aria-label={done ? "Mark as not done" : "Mark as done"}
            onClick={toggleDone}
            className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
              done ? "border-lime bg-lime" : "border-white/25 hover:border-white/50"
            }`}
          >
            {done && <Icon name="solar:check-circle-linear" size={15} className="text-ink" />}
          </button>
          {editing && draft ? (
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="!h-auto py-1 !text-xl font-medium text-white"
            />
          ) : (
            <h1 className={`font-mono text-xl font-medium tracking-tight ${done ? "text-white/40 line-through" : "text-white"}`}>
              {task.title}
            </h1>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={saveEdits} loading={updateTask.isPending}>
                Save
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" icon="solar:pen-linear" onClick={startEditing}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" icon="solar:trash-bin-trash-linear" onClick={remove}>
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SchedulingPill state={schedulingState(task)} />
        <Chip tone={priorityTone(task.priority)}>{task.priority}</Chip>
        {task.category !== "general" && <Chip tone={categoryTone(task.category)}>{categoryLabel(task.category)}</Chip>}
        {task.requiresFocus && <Chip tone="lime">Requires focus</Chip>}
        {overdue && <Chip tone="ember">Overdue</Chip>}
      </div>

      <Card tone="paper" className="flex flex-col gap-4">
        {editing && draft ? (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Duration" description="Minutes">
              <Input
                type="number"
                min={5}
                step={5}
                value={draft.durationMin}
                onChange={(e) => setDraft({ ...draft, durationMin: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Priority">
              <Select
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: e.target.value as TaskPriority })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </Field>
            <Field label="Project" description="Optional">
              <Select value={draft.projectId} onChange={(e) => setDraft({ ...draft, projectId: e.target.value })}>
                <option value="">No project</option>
                {projects?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due date" description="Optional">
              <Input type="date" value={draft.dueBy} onChange={(e) => setDraft({ ...draft, dueBy: e.target.value })} />
            </Field>
            <Field label="Notes" className="col-span-2">
              <Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </Field>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-ink sm:grid-cols-3">
            <Detail label="Duration" value={formatDuration(task.durationMin)} />
            <Detail label="Project" value={project?.name ?? "None"} />
            <Detail
              label="Due by"
              value={task.dueBy ? format(new Date(task.dueBy), "MMM d, yyyy") : "—"}
              alert={overdue}
            />
            <Detail label="Prefer by" value={task.preferBy ? format(new Date(task.preferBy), "MMM d, yyyy") : "—"} />
            <Detail label="Preferred window" value={task.preferredWindow ?? "Any"} />
            <Detail label="Splittable" value={task.splittable ? `Yes · ${task.minChunkMin}m chunks` : "No"} />
            {task.notes && <Detail label="Notes" value={task.notes} className="col-span-2 sm:col-span-3" />}
          </dl>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-widest text-white/50">Provenance</p>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Detail label="Source" value={task.sourceType} dark />
          {task.sourceSignalId && (
            <DetailLink label="From signal" href={`/app/signals/${task.sourceSignalId}`} value="View signal" />
          )}
          <Detail label="Created" value={format(new Date(task.createdAt), "MMM d, yyyy")} dark />
          <Detail label="Updated" value={format(new Date(task.updatedAt), "MMM d, yyyy")} dark />
          {task.completedAt && <Detail label="Completed" value={format(new Date(task.completedAt), "MMM d, yyyy")} dark />}
        </dl>
      </Card>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/app/tasks"
      className="flex w-fit items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-white/50 hover:text-white"
    >
      <Icon name="solar:arrow-left-linear" size={14} />
      Back to tasks
    </Link>
  );
}

function Detail({
  label,
  value,
  alert = false,
  dark = false,
  className,
}: {
  label: string;
  value: string;
  alert?: boolean;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className={`font-mono text-xs uppercase tracking-widest ${dark ? "text-white/40" : "text-ink/40"}`}>{label}</dt>
      <dd className={`mt-0.5 font-mono text-sm ${alert ? "text-ember" : dark ? "text-white" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

function DetailLink({ label, href, value }: { label: string; href: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-xs uppercase tracking-widest text-white/40">{label}</dt>
      <dd className="mt-0.5">
        <Link href={href} className="font-mono text-sm text-lime hover:text-lime-hi">
          {value}
        </Link>
      </dd>
    </div>
  );
}
