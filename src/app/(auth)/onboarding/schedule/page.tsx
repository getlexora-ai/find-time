"use client";

import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { ScheduleEditor } from "@/components/settings/ScheduleEditor";
import { useSettingsSchedule, useUpdateScheduleSettings } from "@/lib/hooks/useSettings";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";

export default function OnboardingSchedulePage() {
  const { data: profile, isLoading } = useSettingsSchedule();
  const update = useUpdateScheduleSettings();

  return (
    <OnboardingLayout
      step="schedule"
      title="When do you work?"
      subtitle="Find Time only schedules inside your working hours, and never on a day you've turned off."
      wide
    >
      {isLoading || !profile ? (
        <SkeletonBlock className="h-96 w-full" />
      ) : (
        <ScheduleEditor profile={profile} onPatch={(patch) => update.mutate(patch)} />
      )}
    </OnboardingLayout>
  );
}
