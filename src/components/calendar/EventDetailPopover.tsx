"use client";

import * as React from "react";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { Chip } from "@/components/ui/Chip";
import { CATEGORY_STYLES } from "@/lib/calendar/categoryStyles";
import { formatTimeRange } from "@/lib/calendar/time";
import { format } from "date-fns";
import type { CalendarEvent } from "@/lib/types/event";

/**
 * Click-an-event detail card: title/time/category + Edit/Delete. Anchored
 * to the clicked EventBlock's own bounding rect rather than a full Radix
 * Popover — the grid has ~35 event blocks and none need individual
 * trigger/anchor ref plumbing for a card this simple.
 */
export function EventDetailPopover({
  event,
  anchorRect,
  onClose,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent | null;
  anchorRect: DOMRect | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const previouslyFocused = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!event) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  if (!event || !anchorRect) return null;
  const style = CATEGORY_STYLES[event.category];

  const width = 260;
  const margin = 12;
  const left = Math.min(Math.max(anchorRect.left, margin), (typeof window !== "undefined" ? window.innerWidth : 1200) - width - margin);
  const top = anchorRect.bottom + 8;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${event.title} details`}
        tabIndex={-1}
        className="fixed z-50 rounded-card border border-white/10 bg-ink p-4 shadow-panel outline-none"
        style={{ top, left, width }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded-control ${style.tile}`}>
              <Icon name={style.iconName} size={13} />
            </span>
            <Chip tone="outline">{style.label}</Chip>
          </div>
          <IconButton icon="solar:close-circle-linear" aria-label="Close" onClick={onClose} />
        </div>
        <p className="mt-3 font-mono text-sm font-medium text-white">{event.title}</p>
        <p className="mt-1 font-mono text-xs text-white/50">
          {format(new Date(event.start), "EEE, MMM d")} · {formatTimeRange(new Date(event.start), new Date(event.end))}
        </p>
        {event.flexibility === "protected" && (
          <p className="mt-2 flex items-center gap-1 font-mono text-micro uppercase tracking-wider text-white/40">
            <Icon name="solar:shield-check-linear" size={12} /> Protected
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            onClick={onEdit}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-control border border-white/10 bg-white/5 py-2 font-mono text-xs uppercase tracking-wider text-white hover:bg-white/10"
          >
            <Icon name="solar:pen-linear" size={13} /> Edit
          </button>
          <button
            onClick={onDelete}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-control border border-ember/30 bg-ember/10 py-2 font-mono text-xs uppercase tracking-wider text-ember-200 hover:bg-ember/20"
          >
            <Icon name="solar:trash-bin-minimalistic-linear" size={13} /> Delete
          </button>
        </div>
      </div>
    </>
  );
}
