"use client";

/**
 * Click-empty-space + drag to draft a new event, plain pointer events +
 * setPointerCapture (same idiom as `DraggableWidgetChip`). While dragging,
 * the caller renders a live provisional block driven by `draft`; on
 * pointerup the drag freezes into `phase: "confirming"` so a quick-add
 * popover (title + confirm) can anchor to the same minute range. The caller
 * must call `cancelCreate()` once the popover is confirmed or dismissed.
 */
import * as React from "react";
import { pxToMinutes, snapMinutes } from "@/lib/calendar/time";
import { SNAP_MINUTES } from "@/lib/calendar/constants";

export interface CreateDraft {
  day: Date;
  startMinutes: number;
  endMinutes: number;
  phase: "dragging" | "confirming";
}

export function useDragToCreate({ hourHeight }: { hourHeight: number }) {
  const [draft, setDraft] = React.useState<CreateDraft | null>(null);
  const originRef = React.useRef<{ pointerId: number; day: Date; containerTop: number; anchorMinutes: number } | null>(null);

  const beginCreate = React.useCallback(
    (e: React.PointerEvent, day: Date) => {
      if (e.button !== 0) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      const offsetY = e.clientY - rect.top;
      const anchorMinutes = Math.max(0, snapMinutes(pxToMinutes(offsetY, hourHeight)));
      originRef.current = { pointerId: e.pointerId, day, containerTop: rect.top, anchorMinutes };
      setDraft({ day, startMinutes: anchorMinutes, endMinutes: anchorMinutes + SNAP_MINUTES, phase: "dragging" });
    },
    [hourHeight],
  );

  const onPointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      const origin = originRef.current;
      if (!origin || e.pointerId !== origin.pointerId) return;
      const offsetY = e.clientY - origin.containerTop;
      const minutes = snapMinutes(pxToMinutes(offsetY, hourHeight));
      const start = Math.max(0, Math.min(origin.anchorMinutes, minutes));
      const end = Math.min(24 * 60, Math.max(origin.anchorMinutes, minutes, start + SNAP_MINUTES));
      setDraft({ day: origin.day, startMinutes: start, endMinutes: end, phase: "dragging" });
    },
    [hourHeight],
  );

  const endCreate = React.useCallback((e: React.PointerEvent) => {
    const origin = originRef.current;
    if (!origin || e.pointerId !== origin.pointerId) return;
    originRef.current = null;
    setDraft((prev) => (prev ? { ...prev, phase: "confirming" } : prev));
  }, []);

  const cancelCreate = React.useCallback(() => {
    originRef.current = null;
    setDraft(null);
  }, []);

  return { draft, beginCreate, onPointerMove, endCreate, cancelCreate };
}
