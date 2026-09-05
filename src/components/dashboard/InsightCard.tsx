"use client";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { useToast } from "@/components/ui/Toast";
import type { CalendarEvent } from "@/lib/types";
import { formatDurationMin, sumProtectedMinutes } from "@/components/dashboard/utils";

function buildInsight(dayEvents: CalendarEvent[]): string {
  const protectedMin = sumProtectedMinutes(dayEvents);
  const meetings = dayEvents.filter((e) => e.category === "meeting");

  if (protectedMin > 0 && meetings.length > 0) {
    return `You have ${formatDurationMin(protectedMin)} of focus time protected today, alongside ${meetings.length} meeting${meetings.length === 1 ? "" : "s"}. Keep the block right after your first meeting free of interruptions.`;
  }
  if (protectedMin > 0) {
    return `You have ${formatDurationMin(protectedMin)} of focus time protected today — no meetings competing for it.`;
  }
  if (dayEvents.length > 0) {
    return "Nothing is protected yet today. Consider reserving a focus block before the day fills up.";
  }
  return "Your day is wide open. This is a good moment to plan a focus block before anything else lands on it.";
}

export function InsightCard({
  dayEvents,
  loading,
}: {
  dayEvents: CalendarEvent[];
  loading?: boolean;
}) {
  const { push } = useToast();

  if (loading) {
    return <SkeletonBlock className="h-40 rounded-2xl" />;
  }

  return (
    <Card tone="periwinkle" className="shadow-panel">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-widest text-ink/50">AI insight</span>
        <Icon name="solar:lightbulb-bolt-linear" size={20} />
      </div>
      <p className="mt-5 font-mono text-base font-medium leading-relaxed tracking-tight text-ink">
        {buildInsight(dayEvents)}
      </p>
      <div className="mt-5 flex gap-2">
        <Button
          size="sm"
          variant="inverse"
          onClick={() => push({ message: "Change applied", variant: "success" })}
        >
          Apply change
        </Button>
        <Button
          size="sm"
          variant="paper"
          onClick={() => push({ message: "Insight dismissed", variant: "success" })}
        >
          Dismiss
        </Button>
      </div>
    </Card>
  );
}
