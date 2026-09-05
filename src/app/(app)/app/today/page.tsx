"use client";

import * as React from "react";
import { addDays } from "date-fns";
import { useEvents } from "@/lib/hooks/useEvents";
import { useTasks } from "@/lib/hooks/useTasks";
import { useProjects } from "@/lib/hooks/useProjects";
import { useSignals } from "@/lib/hooks/useSignals";
import { useSettingsAI } from "@/lib/hooks/useSettings";
import { TodayHeroSection } from "@/components/dashboard/TodayHeroSection";
import { TodayStatsRow } from "@/components/dashboard/TodayStatsRow";
import { TodayScheduleCard } from "@/components/dashboard/TodayScheduleCard";
import { AIAskPanel } from "@/components/dashboard/AIAskPanel";
import { InsightCard } from "@/components/dashboard/InsightCard";
import { UpcomingCard } from "@/components/dashboard/UpcomingCard";
import { SignalsPreviewCard } from "@/components/dashboard/SignalsPreviewCard";
import { getEventsOnDate } from "@/components/dashboard/utils";

export default function TodayPage() {
  const [selectedDate, setSelectedDate] = React.useState(() => new Date());

  const eventsQuery = useEvents();
  const tasksQuery = useTasks();
  const projectsQuery = useProjects();
  const signalsQuery = useSignals();
  const aiSettingsQuery = useSettingsAI();

  const dayEvents = React.useMemo(
    () => getEventsOnDate(eventsQuery.data, selectedDate),
    [eventsQuery.data, selectedDate],
  );
  const compareDayEvents = React.useMemo(
    () => getEventsOnDate(eventsQuery.data, addDays(selectedDate, -7)),
    [eventsQuery.data, selectedDate],
  );

  const eventsLoading = eventsQuery.isLoading;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <TodayHeroSection
        selectedDate={selectedDate}
        onChangeDate={setSelectedDate}
        dayEvents={dayEvents}
        loading={eventsLoading}
      />

      <TodayStatsRow
        dayEvents={dayEvents}
        compareDayEvents={compareDayEvents}
        energyCurve={aiSettingsQuery.data?.energyCurve}
        loading={eventsLoading}
      />

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <TodayScheduleCard
          selectedDate={selectedDate}
          dayEvents={dayEvents}
          tasks={tasksQuery.data}
          projects={projectsQuery.data}
          loading={eventsLoading}
        />

        <aside className="flex flex-col gap-5">
          <AIAskPanel />
          <InsightCard dayEvents={dayEvents} loading={eventsLoading} />
          <UpcomingCard events={eventsQuery.data} loading={eventsLoading} />
          <SignalsPreviewCard signals={signalsQuery.data} loading={signalsQuery.isLoading} />
        </aside>
      </section>
    </div>
  );
}
