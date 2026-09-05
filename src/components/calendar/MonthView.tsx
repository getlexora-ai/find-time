"use client";

import { MonthCell } from "@/components/calendar/MonthCell";
import { getEventsForDay, getAllDayEvents } from "@/lib/calendar/layout";
import { getMonthGridDays } from "@/lib/calendar/time";
import type { CalendarEvent } from "@/lib/types/event";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MonthView({
  monthAnchor,
  events,
  onOpenDay,
  onSelectEvent,
}: {
  monthAnchor: Date;
  events: CalendarEvent[];
  onOpenDay: (d: Date) => void;
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  const days = getMonthGridDays(monthAnchor);

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-7 border-b border-white/10">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="px-2 py-2 text-center font-mono text-micro uppercase tracking-widest text-white/40">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-l border-t border-white/10">
        {days.map((day) => {
          const dayEvents = [
            ...getAllDayEvents(events, day),
            ...getEventsForDay(events, day).map((e) => e.event),
          ];
          return (
            <MonthCell
              key={day.toISOString()}
              date={day}
              monthAnchor={monthAnchor}
              events={dayEvents}
              onOpenDay={onOpenDay}
              onSelectEvent={onSelectEvent}
            />
          );
        })}
      </div>
    </div>
  );
}
