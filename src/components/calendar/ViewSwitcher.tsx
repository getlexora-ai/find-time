"use client";

import { cn } from "@/lib/utils/cn";
import type { CalendarView } from "@/lib/calendar/constants";

const views: { value: CalendarView; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

export function ViewSwitcher({ value, onChange }: { value: CalendarView; onChange: (v: CalendarView) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-control border border-white/10 bg-white/5 p-0.5">
      {views.map((v) => (
        <button
          key={v.value}
          onClick={() => onChange(v.value)}
          className={cn(
            "rounded-[6px] px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors",
            value === v.value ? "bg-white/10 text-white ring-1 ring-white/10" : "text-white/50 hover:text-white",
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
