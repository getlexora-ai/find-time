"use client";

import * as React from "react";
import { startOfDay } from "date-fns";
import { topForStart, formatTimeShort } from "@/lib/calendar/time";

/**
 * Live "now" line for today's column: lime hairline spanning the column
 * width, a glowing dot at the left edge, and an HH:MM label. Position is
 * `minutesFromMidnight * pxPerMinute` — the exact same math EventBlock uses
 * — and is recomputed every 60s (not on a faster tick; a minute-granularity
 * line doesn't need finer).
 */
export function NowIndicator({ day, hourHeight }: { day: Date; hourHeight: number }) {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const top = topForStart(now, hourHeight, startOfDay(day));

  return (
    <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top }}>
      <div className="relative flex items-center">
        <span className="absolute -left-1.5 h-3 w-3 -translate-y-1/2 rounded-full bg-lime shadow-dot" />
        <span className="absolute -left-14 w-12 -translate-y-1/2 text-right font-mono text-micro text-lime">
          {formatTimeShort(now)}
        </span>
        <div className="h-px w-full -translate-y-1/2 bg-lime" />
      </div>
    </div>
  );
}
