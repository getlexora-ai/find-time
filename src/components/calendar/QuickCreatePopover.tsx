"use client";

import * as React from "react";
import { addMinutes, startOfDay } from "date-fns";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { formatMinutesOfDay } from "@/lib/calendar/time";
import type { CreateDraft } from "@/lib/hooks/useDragToCreate";

/**
 * Anchored inline form shown once a drag-to-create gesture reaches its
 * "confirming" phase — title + confirm/cancel, anchored near the draft
 * block rather than centered, so the just-drawn range stays visible.
 */
export function QuickCreatePopover({
  draft,
  anchorRect,
  onConfirm,
  onCancel,
}: {
  draft: CreateDraft;
  anchorRect: DOMRect | null;
  onConfirm: (title: string, start: Date, end: Date) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const dayStart = startOfDay(draft.day);
    const start = addMinutes(dayStart, draft.startMinutes);
    const end = addMinutes(dayStart, draft.endMinutes);
    onConfirm(title.trim() || "New event", start, end);
  };

  const width = 240;
  const margin = 12;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
  const maxLeft = viewportWidth - width - margin;
  const left = anchorRect ? Math.min(Math.max(anchorRect.left, margin), maxLeft) : (viewportWidth - width) / 2;
  const top = anchorRect ? anchorRect.top : 160;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onCancel} />
      <div className="fixed z-50 rounded-card border border-white/10 bg-ink p-3 shadow-panel" style={{ top, left, width }}>
        <p className="mb-2 font-mono text-micro uppercase tracking-wider text-white/40">
          {formatMinutesOfDay(draft.startMinutes)}–{formatMinutesOfDay(draft.endMinutes)}
        </p>
        <Input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a focused task"
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancel();
          }}
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit}>
            Add
          </Button>
        </div>
      </div>
    </>
  );
}
