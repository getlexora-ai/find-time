"use client";

import * as React from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useCreateTask } from "@/lib/hooks/useTasks";
import type { Project, TaskPriority } from "@/lib/types";

export function TaskFormModal({
  open,
  onOpenChange,
  projects,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
}) {
  const createTask = useCreateTask();
  const { push } = useToast();

  const [title, setTitle] = React.useState("");
  const [durationMin, setDurationMin] = React.useState(30);
  const [priority, setPriority] = React.useState<TaskPriority>("medium");
  const [projectId, setProjectId] = React.useState<string>("");
  const [dueBy, setDueBy] = React.useState("");

  const reset = () => {
    setTitle("");
    setDurationMin(30);
    setPriority("medium");
    setProjectId("");
    setDueBy("");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createTask.mutate(
      {
        title: title.trim(),
        durationMin,
        priority,
        projectId: projectId || null,
        dueBy: dueBy ? new Date(dueBy).toISOString() : null,
      },
      {
        onSuccess: () => {
          push({ message: "Task added", variant: "success" });
          reset();
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title="New task"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={createTask.isPending}>
            Add task
          </Button>
        </div>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label="Title">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Write the launch retro doc"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Duration" description="Minutes">
            <Input
              type="number"
              min={5}
              step={5}
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Project" description="Optional">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date" description="Optional">
            <Input type="date" value={dueBy} onChange={(e) => setDueBy(e.target.value)} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
