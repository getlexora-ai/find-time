import { Icon } from "@/components/ui/Icon";
import { CATEGORY_STYLES } from "@/lib/calendar/categoryStyles";
import { getAllDayEvents } from "@/lib/calendar/layout";
import { cn } from "@/lib/utils/cn";
import type { CalendarEvent } from "@/lib/types/event";

/**
 * Sticky row for all-day/multi-day items, one column per visible day.
 */
export function AllDayRow({
  days,
  events,
  onSelectEvent,
}: {
  days: Date[];
  events: CalendarEvent[];
  onSelectEvent?: (event: CalendarEvent) => void;
}) {
  const hasAny = days.some((d) => getAllDayEvents(events, d).length > 0);
  if (!hasAny) return null;

  return (
    <div className="sticky top-0 z-20 flex border-b border-white/10 bg-blue-700/80 blur-bar">
      <div className="w-14 shrink-0" />
      {days.map((day) => {
        const dayEvents = getAllDayEvents(events, day);
        return (
          <div key={day.toISOString()} className="flex flex-1 flex-col gap-1 px-1 py-1.5">
            {dayEvents.map((event) => {
              const style = CATEGORY_STYLES[event.category];
              return (
                <button
                  key={event.id}
                  onClick={() => onSelectEvent?.(event)}
                  className={cn(
                    "flex items-center gap-1 truncate rounded-control px-2 py-1 text-left font-mono text-micro text-white/85",
                    style.block,
                  )}
                >
                  <Icon name={style.iconName} size={11} className={style.icon} />
                  <span className="truncate">{event.title}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
