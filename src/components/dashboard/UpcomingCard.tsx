"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Card } from "@/components/ui/Card";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { cn } from "@/lib/utils/cn";
import type { CalendarEvent } from "@/lib/types";
import { eventDurationMin } from "@/components/dashboard/utils";

const tileTones = [
  "bg-ember text-white",
  "bg-lime text-ink",
  "bg-periwinkle text-ink",
  "bg-amber text-ink",
];

export function UpcomingCard({
  events,
  loading,
}: {
  events: CalendarEvent[] | undefined;
  loading?: boolean;
}) {
  if (loading) {
    return <SkeletonBlock className="h-56 rounded-2xl" />;
  }

  const now = new Date();
  const upcoming = (events ?? [])
    .filter((e) => e.status !== "cancelled" && e.itemType !== "break" && new Date(e.start) > now)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 4);

  return (
    <Card tone="glass">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm font-medium text-white">Upcoming</h3>
        <Link href="/app/calendar" className="font-mono text-xs text-white/40 transition-colors duration-150 hover:text-white">
          View calendar
        </Link>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {upcoming.length === 0 ? (
          <p className="font-mono text-xs text-white/40">Nothing else is on the calendar yet.</p>
        ) : (
          upcoming.map((event, i) => (
            <div key={event.id} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg font-mono text-xs",
                  tileTones[i % tileTones.length],
                )}
              >
                <span>{format(new Date(event.start), "dd")}</span>
                <span className="text-[9px] uppercase opacity-70">{format(new Date(event.start), "MMM")}</span>
              </div>
              <div className="min-w-0">
                <p className="truncate font-mono text-xs text-white">{event.title}</p>
                <p className="mt-1 font-mono text-xs text-white/40">
                  {format(new Date(event.start), "HH:mm")} · {eventDurationMin(event)} min
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
