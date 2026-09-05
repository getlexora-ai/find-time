import { differenceInMinutes, isSameDay, setHours, setMinutes } from "date-fns";
import type { CalendarEvent, SchedulerProfile } from "@/lib/types";

/** "3h 20m" / "45m" / "2h" */
export function formatDurationMin(totalMinutes: number): string {
  const clamped = Math.max(0, Math.round(totalMinutes));
  if (clamped === 0) return "0m";
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Signed duration delta, e.g. "+40m" / "-15m". Returns undefined for no change. */
export function formatDeltaMinutes(diffMinutes: number): string | undefined {
  const rounded = Math.round(diffMinutes);
  if (rounded === 0) return undefined;
  return `${rounded > 0 ? "+" : "-"}${formatDurationMin(Math.abs(rounded))}`;
}

/** Non-cancelled events on a given calendar day, sorted by start time. */
export function getEventsOnDate(events: CalendarEvent[] | undefined, date: Date): CalendarEvent[] {
  if (!events) return [];
  return events
    .filter((e) => e.status !== "cancelled" && isSameDay(new Date(e.start), date))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export function eventDurationMin(event: CalendarEvent): number {
  return differenceInMinutes(new Date(event.end), new Date(event.start));
}

export function sumDurationMin(events: CalendarEvent[]): number {
  return events.reduce((sum, e) => sum + eventDurationMin(e), 0);
}

/** Focus time worth protecting in the stat card: protected blocks + deep-work category. */
export function sumProtectedMinutes(events: CalendarEvent[]): number {
  return sumDurationMin(
    events.filter((e) => e.flexibility === "protected" || e.category === "deep-work"),
  );
}

export interface EnergyForecast {
  label: "High" | "Moderate" | "Low";
  delta?: string;
}

/**
 * Derives a simple energy-forecast label from the user's SchedulerProfile.energyCurve
 * (real data when available) with a reasonable time-of-day fallback otherwise.
 */
export function computeEnergyForecast(
  curve: SchedulerProfile["energyCurve"] | undefined,
  now: Date,
): EnergyForecast {
  const hour = now.getHours();
  if (!curve || curve.length === 0) {
    if (hour < 12) return { label: "High", delta: "morning focus window" };
    if (hour < 16) return { label: "Moderate", delta: "post-lunch dip" };
    return { label: "Low", delta: "winding down" };
  }

  const sorted = [...curve].sort((a, b) => a.hour - b.hour);
  let current = sorted[0];
  let next: (typeof sorted)[number] | undefined;
  for (const point of sorted) {
    if (point.hour <= hour) current = point;
    else {
      next = point;
      break;
    }
  }

  const label: EnergyForecast["label"] =
    current.level >= 0.85 ? "High" : current.level >= 0.6 ? "Moderate" : "Low";
  const delta = next ? `until ${String(next.hour).padStart(2, "0")}:00` : "steady into evening";
  return { label, delta };
}

/** Next reasonable slot to drop a quick-added item into today's schedule. */
export function computeNextSlotStart(date: Date, dayEvents: CalendarEvent[]): Date {
  const defaultStart = setMinutes(setHours(date, 9), 0);
  const lastEnd = dayEvents.length
    ? new Date(Math.max(...dayEvents.map((e) => new Date(e.end).getTime())))
    : defaultStart;

  const now = new Date();
  const floor = isSameDay(date, now) && now.getTime() > lastEnd.getTime() ? now : lastEnd;

  const rounded = new Date(floor);
  rounded.setSeconds(0, 0);
  const remainder = rounded.getMinutes() % 15;
  if (remainder !== 0) rounded.setMinutes(rounded.getMinutes() + (15 - remainder));
  return rounded;
}
