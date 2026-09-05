"use client";

import * as React from "react";

/**
 * Client-only "current time" tick, shared by every day column so "past"
 * dimming and the now-indicator agree on the same instant. Starts `null` so
 * server-rendered markup never depends on wall-clock time (avoids hydration
 * mismatches); becomes a real Date after mount and refreshes every 60s.
 */
export function useNow(intervalMs = 60_000): Date | null {
  const [now, setNow] = React.useState<Date | null>(null);

  React.useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
