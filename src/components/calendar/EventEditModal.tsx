"use client";

import * as React from "react";
import { format } from "date-fns";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { CATEGORY_STYLES } from "@/lib/calendar/categoryStyles";
import type { CalendarEvent, EventCategory } from "@/lib/types/event";

const CATEGORY_OPTIONS: EventCategory[] = [
  "deep-work",
  "design",
  "research",
  "meeting",
  "admin",
  "learning",
  "break",
  "other",
];

export function EventEditModal({
  event,
  open,
  onOpenChange,
  onSave,
}: {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: { title: string; category: EventCategory; start: string; end: string }) => void;
}) {
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState<EventCategory>("other");
  const [startTime, setStartTime] = React.useState("09:00");
  const [endTime, setEndTime] = React.useState("10:00");

  React.useEffect(() => {
    if (!event) return;
    setTitle(event.title);
    setCategory(event.category);
    setStartTime(format(new Date(event.start), "HH:mm"));
    setEndTime(format(new Date(event.end), "HH:mm"));
  }, [event]);

  if (!event) return null;

  const handleSave = () => {
    const startDay = new Date(event.start);
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const start = new Date(startDay);
    start.setHours(sh, sm, 0, 0);
    const end = new Date(startDay);
    end.setHours(eh, em, 0, 0);
    onSave({ title: title.trim() || event.title, category, start: start.toISOString(), end: end.toISOString() });
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Edit event"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value as EventCategory)}>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_STYLES[c].label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start">
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="End">
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
