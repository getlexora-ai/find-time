"use client";

/**
 * Vertical (time-of-day) drag-to-reschedule for a single day column, via
 * plain pointer events + setPointerCapture — the same idiom as
 * `DraggableWidgetChip`. One instance is shared across a whole Day/Week
 * view; pointer capture keeps subsequent move/up events routed to whichever
 * EventBlock started the drag, regardless of which column the cursor
 * wanders over.
 *
 * Only one axis moves: minutes-from-day-start, snapped to 15min. Moving an
 * event to a different day is out of scope here (that's the dnd-kit-backed
 * task-backlog-to-calendar drag, a separate concern).
 */
import * as React from "react";
import { addMinutes } from "date-fns";
import { pxToMinutes, snapMinutes } from "@/lib/calendar/time";

export interface RescheduleDragState {
  eventId: string;
  deltaMinutes: number;
}

interface DraggableEvent {
  id: string;
  start: Date;
  end: Date;
}

export function useDragToReschedule({
  hourHeight,
  onCommit,
}: {
  hourHeight: number;
  onCommit: (eventId: string, newStart: Date, newEnd: Date) => void;
}) {
  const [dragState, setDragState] = React.useState<RescheduleDragState | null>(null);
  const originRef = React.useRef<{ pointerId: number; startY: number; event: DraggableEvent } | null>(null);

  const beginDrag = React.useCallback(
    (e: React.PointerEvent, event: DraggableEvent) => {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      originRef.current = { pointerId: e.pointerId, startY: e.clientY, event };
      setDragState({ eventId: event.id, deltaMinutes: 0 });
    },
    [],
  );

  const onPointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      const origin = originRef.current;
      if (!origin || e.pointerId !== origin.pointerId) return;
      const deltaY = e.clientY - origin.startY;
      const snapped = snapMinutes(pxToMinutes(deltaY, hourHeight));
      setDragState({ eventId: origin.event.id, deltaMinutes: snapped });
    },
    [hourHeight],
  );

  const endDrag = React.useCallback(
    (e: React.PointerEvent) => {
      const origin = originRef.current;
      if (!origin || e.pointerId !== origin.pointerId) return;
      const deltaY = e.clientY - origin.startY;
      const snapped = snapMinutes(pxToMinutes(deltaY, hourHeight));
      if (snapped !== 0) {
        onCommit(origin.event.id, addMinutes(origin.event.start, snapped), addMinutes(origin.event.end, snapped));
      }
      originRef.current = null;
      setDragState(null);
    },
    [hourHeight, onCommit],
  );

  const cancelDrag = React.useCallback(() => {
    originRef.current = null;
    setDragState(null);
  }, []);

  return { dragState, beginDrag, onPointerMove, endDrag, cancelDrag };
}
