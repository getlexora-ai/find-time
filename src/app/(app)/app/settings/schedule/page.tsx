"use client";

import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { ScheduleEditor } from "@/components/settings/ScheduleEditor";
import { useSettingsSchedule, useUpdateScheduleSettings } from "@/lib/hooks/useSettings";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";

export default function SettingsSchedulePage() {
  const { data: profile, isLoading } = useSettingsSchedule();
  const update = useUpdateScheduleSettings();

  return (
    <SettingsLayout title="Working hours" description="When you're available, and how much breathing room to leave between events.">
      {isLoading || !profile ? (
        <SkeletonBlock className="h-96 w-full" />
      ) : (
        <ScheduleEditor profile={profile} onPatch={(patch) => update.mutate(patch)} />
      )}
    </SettingsLayout>
  );
}
