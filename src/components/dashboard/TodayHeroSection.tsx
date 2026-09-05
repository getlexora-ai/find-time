"use client";

import { addDays, format, isToday } from "date-fns";
import { IconButton } from "@/components/ui/IconButton";
import { StatusDot } from "@/components/ui/StatusDot";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { heroCopy } from "@/content/voice";
import type { CalendarEvent } from "@/lib/types";
import { formatDurationMin, sumProtectedMinutes } from "@/components/dashboard/utils";

function buildSummary(dayEvents: CalendarEvent[]): string {
  if (dayEvents.length === 0) {
    return "Nothing is booked yet — a wide-open day to get ahead on what matters.";
  }
  const protectedMin = sumProtectedMinutes(dayEvents);
  const meetings = dayEvents.filter((e) => e.category === "meeting").length;
  const meetingWord = meetings === 1 ? "meeting" : "meetings";

  if (protectedMin > 0 && meetings > 0) {
    return `You have ${formatDurationMin(protectedMin)} of protected focus time and ${meetings} ${meetingWord} today.`;
  }
  if (protectedMin > 0) {
    return `You have ${formatDurationMin(protectedMin)} of protected focus time today — no meetings on the books.`;
  }
  if (meetings > 0) {
    return `${meetings} ${meetingWord} today, and the rest of the day is open for flexible work.`;
  }
  return `${dayEvents.length} item${dayEvents.length === 1 ? "" : "s"} on the schedule today.`;
}

export function TodayHeroSection({
  selectedDate,
  onChangeDate,
  dayEvents,
  loading,
}: {
  selectedDate: Date;
  onChangeDate: (date: Date) => void;
  dayEvents: CalendarEvent[];
  loading?: boolean;
}) {
  const now = new Date();
  const dateLabel = isToday(selectedDate)
    ? `Today, ${format(selectedDate, "MMM dd")}`
    : format(selectedDate, "EEEE, MMM dd");

  return (
    <section className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <div className="mb-3 flex items-center gap-2 text-lime">
          <StatusDot tone="live" pulse />
          <span className="font-mono text-xs uppercase tracking-[0.16rem]">
            {heroCopy.eyebrow} · {format(now, "EEEE dd")}
          </span>
        </div>
        <h1 className="max-w-2xl font-mono text-3xl font-medium leading-tight tracking-tight text-white sm:text-4xl">
          {heroCopy.headlineLine1} {heroCopy.headlineLine2}
        </h1>
        {loading ? (
          <SkeletonBlock className="mt-3 h-5 w-72" />
        ) : (
          <p className="mt-3 max-w-xl font-mono text-sm leading-relaxed text-white/55">
            {buildSummary(dayEvents)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <IconButton
          icon="solar:alt-arrow-left-linear"
          aria-label="Previous day"
          onClick={() => onChangeDate(addDays(selectedDate, -1))}
        />
        <button
          className="h-10 rounded-control border border-white/10 bg-white/5 px-4 font-mono text-xs text-white transition-colors duration-150 hover:bg-white/10"
          onClick={() => onChangeDate(new Date())}
        >
          {dateLabel}
        </button>
        <IconButton
          icon="solar:alt-arrow-right-linear"
          aria-label="Next day"
          onClick={() => onChangeDate(addDays(selectedDate, 1))}
        />
      </div>
    </section>
  );
}
