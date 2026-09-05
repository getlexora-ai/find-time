"use client";

import { TimeGutter } from "@/components/calendar/TimeGutter";
import { DayColumn } from "@/components/calendar/DayColumn";
import { DayHeaderCell } from "@/components/calendar/DayHeaderCell";
import { AllDayRow } from "@/components/calendar/AllDayRow";
import { dayColumnHeight } from "@/lib/calendar/time";
import type { CalendarEvent } from "@/lib/types/event";
import type { useDragToReschedule } from "@/lib/hooks/useDragToReschedule";
import type { useResizeEvent } from "@/lib/hooks/useResizeEvent";
import type { useDragToCreate } from "@/lib/hooks/useDragToCreate";

export function WeekView({
  days,
  events,
  hourHeight,
  now,
  selectedEventId,
  onSelectEvent,
  onOpenDay,
  reschedule,
  resize,
  create,
}: {
  days: Date[];
  events: CalendarEvent[];
  hourHeight: number;
  now: Date | null;
  selectedEventId: string | null;
  onSelectEvent: (event: CalendarEvent, anchorRect: DOMRect) => void;
  onOpenDay: (d: Date) => void;
  reschedule: ReturnType<typeof useDragToReschedule>;
  resize: ReturnType<typeof useResizeEvent>;
  create: ReturnType<typeof useDragToCreate>;
}) {
  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-20 flex border-b border-white/10 bg-blue/80 blur-bar">
        <div className="w-14 shrink-0" />
        {days.map((day) => (
          <DayHeaderCell key={day.toISOString()} date={day} onClick={() => onOpenDay(day)} />
        ))}
      </div>
      <AllDayRow days={days} events={events} onSelectEvent={(e) => onSelectEvent(e, new DOMRect())} />
      <div className="flex overflow-x-auto">
        <TimeGutter hourHeight={hourHeight} />
        <div className="relative flex flex-1" style={{ height: dayColumnHeight(hourHeight) }}>
          {days.map((day) => (
            <DayColumn
              key={day.toISOString()}
              date={day}
              events={events}
              hourHeight={hourHeight}
              now={now}
              selectedEventId={selectedEventId}
              onSelectEvent={onSelectEvent}
              reschedule={reschedule}
              resize={resize}
              create={create}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
