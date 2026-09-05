"use client";

import { format, isSameMonth, isToday } from "date-fns";
import { getMonthGridDays, isSameDay } from "@/lib/calendar/time";
import { cn } from "@/lib/utils/cn";

export function MiniMonth({ date, onSelect }: { date: Date; onSelect: (d: Date) => void }) {
  const days = getMonthGridDays(date);

  return (
    <div className="w-64 rounded-card border border-white/10 bg-ink p-3 shadow-panel">
      <p className="mb-2 text-center font-mono text-xs uppercase tracking-widest text-white/60">
        {format(date, "MMMM yyyy")}
      </p>
      <div className="grid grid-cols-7 gap-y-1">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="text-center font-mono text-micro text-white/30">
            {d}
          </span>
        ))}
        {days.map((day) => (
          <button
            key={day.toISOString()}
            onClick={() => onSelect(day)}
            className={cn(
              "flex h-7 w-7 items-center justify-center justify-self-center rounded-full font-mono text-micro",
              isToday(day) && "ring-1 ring-lime",
              isSameDay(day, date) ? "bg-lime text-ink" : "text-white/70 hover:bg-white/10",
              !isSameMonth(day, date) && "text-white/20",
            )}
          >
            {format(day, "d")}
          </button>
        ))}
      </div>
    </div>
  );
}
