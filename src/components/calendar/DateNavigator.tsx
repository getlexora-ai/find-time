"use client";

import * as React from "react";
import { addDays, addMonths, addWeeks, format, isToday } from "date-fns";
import * as Popover from "@radix-ui/react-popover";
import { IconButton } from "@/components/ui/IconButton";
import { MiniMonth } from "@/components/calendar/MiniMonth";
import type { CalendarView } from "@/lib/calendar/constants";

export function DateNavigator({
  date,
  view,
  onChange,
}: {
  date: Date;
  view: CalendarView;
  onChange: (next: Date) => void;
}) {
  const step = (dir: 1 | -1) => {
    if (view === "day") onChange(addDays(date, dir));
    else if (view === "week") onChange(addWeeks(date, dir));
    else onChange(addMonths(date, dir));
  };

  return (
    <div className="flex items-center gap-1">
      <IconButton icon="solar:alt-arrow-left-linear" aria-label="Previous" onClick={() => step(-1)} />
      <Popover.Root>
        <Popover.Trigger asChild>
          <button className="rounded-control border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-white hover:bg-white/10">
            {isToday(date) ? "Today, " : ""}
            {format(date, "MMM d")}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="start" sideOffset={8} className="z-50">
            <MiniMonth date={date} onSelect={onChange} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <IconButton icon="solar:alt-arrow-right-linear" aria-label="Next" onClick={() => step(1)} />
      {!isToday(date) && (
        <button
          onClick={() => onChange(new Date())}
          className="ml-1 font-mono text-micro uppercase tracking-wider text-lime hover:text-lime-hi"
        >
          Today
        </button>
      )}
    </div>
  );
}
