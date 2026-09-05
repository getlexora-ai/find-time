"use client";

import * as React from "react";
import { differenceInMinutes, isSameDay, isToday, startOfDay } from "date-fns";
import { HourGrid } from "@/components/calendar/HourGrid";
import { NowIndicator } from "@/components/calendar/NowIndicator";
import { EventBlock } from "@/components/calendar/EventBlock";
import { layoutDayEvents } from "@/lib/calendar/layout";
import { dayColumnHeight, heightForDuration, pxPerMinute, topForStart } from "@/lib/calendar/time";
import { CSS_HOUR_HEIGHT_VAR } from "@/lib/calendar/constants";
import type { CalendarEvent } from "@/lib/types/event";
import type { useDragToReschedule } from "@/lib/hooks/useDragToReschedule";
import type { useResizeEvent } from "@/lib/hooks/useResizeEvent";
import type { useDragToCreate } from "@/lib/hooks/useDragToCreate";

/**
 * One day's grid + its events. All positioning is delegated to
 * `layoutDayEvents` (overlap columns) and `topForStart`/`heightForDuration`
 * (real time -> real pixels) — this component only composes those numbers
 * with live drag/resize deltas, it never invents its own geometry.
 */
export function DayColumn({
  date,
  events,
  hourHeight,
  now,
  selectedEventId,
  onSelectEvent,
  reschedule,
  resize,
  create,
  draftIndexById,
}: {
  date: Date;
  events: CalendarEvent[];
  hourHeight: number;
  now: Date | null;
  selectedEventId: string | null;
  onSelectEvent: (event: CalendarEvent, anchorRect: DOMRect) => void;
  reschedule: ReturnType<typeof useDragToReschedule>;
  resize: ReturnType<typeof useResizeEvent>;
  create: ReturnType<typeof useDragToCreate>;
  draftIndexById?: Map<string, number>;
}) {
  const dayStart = startOfDay(date);
  const positioned = layoutDayEvents(events, date);
  const today = isToday(date);
  const ppm = pxPerMinute(hourHeight);

  return (
    <div
      className="relative flex-1 border-l border-white/10 first:border-l-0"
      style={{ height: dayColumnHeight(hourHeight), [CSS_HOUR_HEIGHT_VAR]: `${hourHeight}px` } as React.CSSProperties}
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        create.beginCreate(e, date);
      }}
      onPointerMove={create.onPointerMove}
      onPointerUp={create.endCreate}
    >
      <HourGrid hourHeight={hourHeight} />
      {today && now && <NowIndicator day={date} hourHeight={hourHeight} />}

      {positioned.map(({ event, start, end, columnIndex, columnCount, conflict }) => {
        let top = topForStart(start, hourHeight, dayStart);
        let height = heightForDuration(differenceInMinutes(end, start), hourHeight);

        const isDraggingThis = reschedule.dragState?.eventId === event.id;
        const isResizingThis = resize.resizeState?.eventId === event.id;

        if (isDraggingThis) top += reschedule.dragState!.deltaMinutes * ppm;
        if (isResizingThis) {
          const delta = resize.resizeState!.deltaMinutes * ppm;
          if (resize.resizeState!.edge === "start") {
            top += delta;
            height -= delta;
          } else {
            height += delta;
          }
        }

        return (
          <EventBlock
            key={event.id}
            event={event}
            top={top}
            height={height}
            leftPct={(columnIndex / columnCount) * 100}
            widthPct={100 / columnCount}
            selected={selectedEventId === event.id}
            conflict={conflict}
            isDragging={isDraggingThis}
            isPast={!!now && end < now}
            isDraft={event.isDraft}
            draftIndex={draftIndexById?.get(event.id)}
            onSelect={onSelectEvent}
            onDragPointerDown={(e) => {
              e.stopPropagation();
              reschedule.beginDrag(e, { id: event.id, start: new Date(event.start), end: new Date(event.end) });
            }}
            onDragPointerMove={(e) => {
              e.stopPropagation();
              reschedule.onPointerMove(e);
            }}
            onDragPointerUp={(e) => {
              e.stopPropagation();
              reschedule.endDrag(e);
            }}
            onResizePointerDown={(e, edge) => {
              resize.beginResize(e, { id: event.id, start: new Date(event.start), end: new Date(event.end) }, edge);
            }}
            onResizePointerMove={resize.onPointerMove}
            onResizePointerUp={resize.endResize}
          />
        );
      })}

      {create.draft && isSameDay(create.draft.day, date) && (
        <div
          className="absolute inset-x-1 flex items-start rounded-control border border-dashed border-lime bg-lime/10 px-1.5 py-1 font-mono text-micro text-lime"
          style={{
            top: create.draft.startMinutes * ppm,
            height: Math.max((create.draft.endMinutes - create.draft.startMinutes) * ppm, 6),
          }}
        >
          {create.draft.phase === "dragging" && <span>{create.draft.endMinutes - create.draft.startMinutes} min</span>}
        </div>
      )}
    </div>
  );
}
