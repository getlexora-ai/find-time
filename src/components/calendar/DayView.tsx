"use client";

import { TimeGutter } from "@/components/calendar/TimeGutter";
import { DayColumn } from "@/components/calendar/DayColumn";
import { AllDayRow } from "@/components/calendar/AllDayRow";
import { dayColumnHeight } from "@/lib/calendar/time";
import type { CalendarEvent } from "@/lib/types/event";
import type { useDragToReschedule } from "@/lib/hooks/useDragToReschedule";
import type { useResizeEvent } from "@/lib/hooks/useResizeEvent";
import type { useDragToCreate } from "@/lib/hooks/useDragToCreate";

export function DayView({
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
  return (
    <div className="flex flex-col">
      <AllDayRow days={[date]} events={events} onSelectEvent={(e) => onSelectEvent(e, new DOMRect())} />
      <div className="flex overflow-x-auto">
        <TimeGutter hourHeight={hourHeight} />
        <div className="relative flex-1" style={{ height: dayColumnHeight(hourHeight) }}>
          <DayColumn
            date={date}
            events={events}
            hourHeight={hourHeight}
            now={now}
            selectedEventId={selectedEventId}
            onSelectEvent={onSelectEvent}
            reschedule={reschedule}
            resize={resize}
            create={create}
            draftIndexById={draftIndexById}
          />
        </div>
      </div>
    </div>
  );
}
