"use client";

import { isToday } from "date-fns";
import { cn } from "@/lib/utils/cn";
import { CATEGORY_STYLES } from "@/lib/calendar/categoryStyles";
import { formatDateNum, formatTimeShort, isSameMonth } from "@/lib/calendar/time";
import type { CalendarEvent } from "@/lib/types/event";

const MAX_VISIBLE = 3;

export function MonthCell({
  date,
  monthAnchor,
  events,
  onOpenDay,
  onSelectEvent,
}: {
  date: Date;
  monthAnchor: Date;
  events: CalendarEvent[];
  onOpenDay: (d: Date) => void;
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  const today = isToday(date);
  const inMonth = isSameMonth(date, monthAnchor);
  const visible = events.slice(0, MAX_VISIBLE);
  const overflow = events.length - visible.length;

  return (
    <div
      className={cn(
        "flex min-h-[108px] flex-col gap-1 border-b border-r border-white/10 p-1.5",
        !inMonth && "bg-black/10",
      )}
    >
      <button
        onClick={() => onOpenDay(date)}
        className={cn(
          "self-start rounded-full px-1.5 font-mono text-xs",
          today ? "bg-lime font-semibold text-ink" : inMonth ? "text-white/70" : "text-white/25",
        )}
      >
        {formatDateNum(date)}
      </button>
      <div className="flex flex-col gap-0.5">
        {visible.map((event) => {
          const style = CATEGORY_STYLES[event.category];
          return (
            <button
              key={event.id}
              onClick={() => onSelectEvent(event)}
              className={cn(
                "flex items-center gap-1 truncate rounded-[4px] px-1 py-0.5 text-left font-mono text-micro text-white/85",
                style.block,
              )}
            >
              <span className="shrink-0 text-white/40">{event.allDay ? "" : formatTimeShort(new Date(event.start))}</span>
              <span className="truncate">{event.title}</span>
            </button>
          );
        })}
        {overflow > 0 && (
          <button
            onClick={() => onOpenDay(date)}
            className="px-1 text-left font-mono text-micro text-white/40 hover:text-white/70"
          >
            +{overflow} more
          </button>
        )}
      </div>
    </div>
  );
}
