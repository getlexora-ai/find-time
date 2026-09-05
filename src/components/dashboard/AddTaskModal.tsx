"use client";

import * as React from "react";
import { addMinutes } from "date-fns";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useCreateTask } from "@/lib/hooks/useTasks";
import { useCreateEvent } from "@/lib/hooks/useEvents";
import type { CalendarEvent, EventCategory } from "@/lib/types";
import { computeNextSlotStart } from "@/components/dashboard/utils";
import { categoryMeta } from "@/components/dashboard/categoryMeta";

const scheduleCategories: EventCategory[] = ["deep-work", "design", "research", "meeting", "admin", "learning"];

export function AddTaskModal({
  open,
  onOpenChange,
  selectedDate,
  dayEvents,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date;
  dayEvents: CalendarEvent[];
}) {
  const { push } = useToast();
  const createTask = useCreateTask();
  const createEvent = useCreateEvent();

  const [title, setTitle] = React.useState("");
  const [durationMin, setDurationMin] = React.useState(30);
  const [category, setCategory] = React.useState<EventCategory>("admin");
  const [submitting, setSubmitting] = React.useState(false);

  const reset = () => {
    setTitle("");
    setDurationMin(30);
    setCategory("admin");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const task = await createTask.mutateAsync({
        title: title.trim(),
        durationMin,
        status: "scheduled",
        requiresFocus: category === "deep-work",
      });

      const start = computeNextSlotStart(selectedDate, dayEvents);
      const end = addMinutes(start, durationMin);

      await createEvent.mutateAsync({
        title: title.trim(),
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: false,
        timezone: "Europe/Berlin",
        itemType: "task",
        category,
        taskId: task.id,
        status: "confirmed",
        origin: "manual",
        isDraft: false,
        flexibility: "flexible",
        requiresFocus: category === "deep-work",
      });

      push({ message: `“${title.trim()}” added to today's schedule`, variant: "success" });
      reset();
      onOpenChange(false);
    } catch {
      push({ message: "Couldn't add that task — try again", variant: "alert" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Add task"
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <Field label="Title">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Draft the client follow-up"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration">
            <Select
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
            >
              {[15, 30, 45, 60, 90, 120].map((min) => (
                <option key={min} value={min}>
                  {min} min
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value as EventCategory)}>
              {scheduleCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {categoryMeta[cat].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={!title.trim()}>
            Add to schedule
          </Button>
        </div>
      </form>
    </Modal>
  );
}
