"use client";

import { Button } from "@/components/ui/Button";
import { DateNavigator } from "@/components/calendar/DateNavigator";
import { ViewSwitcher } from "@/components/calendar/ViewSwitcher";
import type { CalendarView } from "@/lib/calendar/constants";

export function CalendarToolbar({
  date,
  view,
  onDateChange,
  onViewChange,
  onAddEvent,
}: {
  date: Date;
  view: CalendarView;
  onDateChange: (d: Date) => void;
  onViewChange: (v: CalendarView) => void;
  onAddEvent: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
      <DateNavigator date={date} view={view} onChange={onDateChange} />
      <div className="flex items-center gap-2">
        <ViewSwitcher value={view} onChange={onViewChange} />
        <Button size="sm" icon="solar:add-circle-linear" onClick={onAddEvent}>
          Add event
        </Button>
      </div>
    </div>
  );
}
