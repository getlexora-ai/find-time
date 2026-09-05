"use client";

import { StatCard } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import type { CalendarEvent, SchedulerProfile } from "@/lib/types";
import {
  computeEnergyForecast,
  formatDeltaMinutes,
  formatDurationMin,
  sumProtectedMinutes,
} from "@/components/dashboard/utils";

export function TodayStatsRow({
  dayEvents,
  compareDayEvents,
  energyCurve,
  loading,
}: {
  dayEvents: CalendarEvent[];
  /** Same weekday, previous week — used to derive a real "vs last week" delta. */
  compareDayEvents: CalendarEvent[];
  energyCurve?: SchedulerProfile["energyCurve"];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <section className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <SkeletonBlock key={i} className="h-24 rounded-xl" />
        ))}
      </section>
    );
  }

  const protectedMin = sumProtectedMinutes(dayEvents);
  const protectedDelta = formatDeltaMinutes(protectedMin - sumProtectedMinutes(compareDayEvents));

  const scheduleItems = dayEvents.filter((e) => e.itemType !== "break");
  const protectedCount = scheduleItems.filter((e) => e.flexibility === "protected").length;

  const energy = computeEnergyForecast(energyCurve, new Date());

  return (
    <section className="grid gap-4 sm:grid-cols-3">
      <StatCard
        label="Focus protected"
        value={formatDurationMin(protectedMin)}
        delta={protectedDelta}
        icon={<Icon name="solar:shield-check-linear" size={20} className="text-lime" />}
      />
      <StatCard
        label="Tasks planned"
        value={String(scheduleItems.length).padStart(2, "0")}
        delta={protectedCount > 0 ? `${protectedCount} protected` : undefined}
        icon={<Icon name="solar:checklist-minimalistic-linear" size={20} className="text-periwinkle" />}
      />
      <StatCard
        label="Energy forecast"
        value={energy.label}
        delta={energy.delta}
        icon={<Icon name="solar:bolt-linear" size={20} className="text-ember-400" />}
      />
    </section>
  );
}
