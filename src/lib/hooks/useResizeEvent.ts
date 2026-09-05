"use client";

/**
 * Resize-to-change-duration via top/bottom edge handles. Same plain
 * pointer-event + setPointerCapture idiom as `DraggableWidgetChip`. Snaps to
 * 15min and never lets a resize collapse an event below
 * MIN_EVENT_DURATION_MINUTES.
 */
import * as React from "react";
import { addMinutes } from "date-fns";
import { pxToMinutes, snapMinutes } from "@/lib/calendar/time";
import { MIN_EVENT_DURATION_MINUTES } from "@/lib/calendar/constants";

export type ResizeEdge = "start" | "end";

export interface ResizeDragState {
  eventId: string;
  edge: ResizeEdge;
  deltaMinutes: number;
}

interface ResizableEvent {
  id: string;
  start: Date;
  end: Date;
}

export function useResizeEvent({
  hourHeight,
  onCommit,
}: {
  hourHeight: number;
  onCommit: (eventId: string, newStart: Date, newEnd: Date) => void;
}) {
  const [resizeState, setResizeState] = React.useState<ResizeDragState | null>(null);
  const originRef = React.useRef<{ pointerId: number; startY: number; edge: ResizeEdge; event: ResizableEvent } | null>(null);

  const clampDelta = (edge: ResizeEdge, event: ResizableEvent, rawDelta: number) => {
    const durationMin = (event.end.getTime() - event.start.getTime()) / 60000;
    if (edge === "start") {
      // start moving down (positive delta) shrinks duration; clamp so it never drops below the floor
      return Math.min(rawDelta, durationMin - MIN_EVENT_DURATION_MINUTES);
    }
    // end moving up (negative delta) shrinks duration
    return Math.max(rawDelta, MIN_EVENT_DURATION_MINUTES - durationMin);
  };

  const beginResize = React.useCallback((e: React.PointerEvent, event: ResizableEvent, edge: ResizeEdge) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    originRef.current = { pointerId: e.pointerId, startY: e.clientY, edge, event };
    setResizeState({ eventId: event.id, edge, deltaMinutes: 0 });
  }, []);

  const onPointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      const origin = originRef.current;
      if (!origin || e.pointerId !== origin.pointerId) return;
      const deltaY = e.clientY - origin.startY;
      const snapped = snapMinutes(pxToMinutes(deltaY, hourHeight));
      const clamped = clampDelta(origin.edge, origin.event, snapped);
      setResizeState({ eventId: origin.event.id, edge: origin.edge, deltaMinutes: clamped });
    },
    [hourHeight],
  );

  const endResize = React.useCallback(
    (e: React.PointerEvent) => {
      const origin = originRef.current;
      if (!origin || e.pointerId !== origin.pointerId) return;
      const deltaY = e.clientY - origin.startY;
      const snapped = snapMinutes(pxToMinutes(deltaY, hourHeight));
      const clamped = clampDelta(origin.edge, origin.event, snapped);
      if (clamped !== 0) {
        const newStart = origin.edge === "start" ? addMinutes(origin.event.start, clamped) : origin.event.start;
        const newEnd = origin.edge === "end" ? addMinutes(origin.event.end, clamped) : origin.event.end;
        onCommit(origin.event.id, newStart, newEnd);
      }
      originRef.current = null;
      setResizeState(null);
    },
    [hourHeight, onCommit],
  );

  const cancelResize = React.useCallback(() => {
    originRef.current = null;
    setResizeState(null);
  }, []);

  return { resizeState, beginResize, onPointerMove, endResize, cancelResize };
}
