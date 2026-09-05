"use client";

import * as React from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useCreateProject } from "@/lib/hooks/useProjects";

const COLOR_OPTIONS = ["lime", "periwinkle", "ember", "amber", "white"] as const;

export function ProjectFormModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createProject = useCreateProject();
  const { push } = useToast();

  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState<(typeof COLOR_OPTIONS)[number]>("lime");
  const [description, setDescription] = React.useState("");
  const [targetDate, setTargetDate] = React.useState("");

  const reset = () => {
    setName("");
    setColor("lime");
    setDescription("");
    setTargetDate("");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createProject.mutate(
      {
        name: name.trim(),
        color,
        description: description.trim() || null,
        targetDate: targetDate ? new Date(targetDate).toISOString() : null,
      },
      {
        onSuccess: () => {
          push({ message: "Project created", variant: "success" });
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
      title="New project"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={createProject.isPending}>
            Create project
          </Button>
        </div>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label="Name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Q4 Launch" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Color">
            <Select value={color} onChange={(e) => setColor(e.target.value as (typeof COLOR_OPTIONS)[number])}>
              {COLOR_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Target date" description="Optional">
            <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Description" description="Optional">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
