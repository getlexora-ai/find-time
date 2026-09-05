"use client";

import { useSettingsAI, useUpdateAISettings } from "@/lib/hooks/useSettings";
import { SegmentedControl } from "@/components/settings/SegmentedControl";
import { RangeSlider } from "@/components/settings/RangeSlider";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { Panel } from "@/components/ui/Panel";
import type { AIAutonomy } from "@/lib/types";

const AUTONOMY_OPTIONS: { value: AIAutonomy; label: string }[] = [
  { value: "suggest", label: "Suggest only" },
  { value: "draft-daily", label: "Draft daily" },
  { value: "auto-protect", label: "Auto-protect" },
  { value: "full-auto", label: "Full auto" },
];

const AUTONOMY_COPY: Record<AIAutonomy, string> = {
  suggest: "Find Time only proposes changes — nothing is ever added to your calendar without you tapping Accept.",
  "draft-daily": "Each morning, Find Time drafts a plan for the day. Review and apply it in one tap.",
  "auto-protect": "Flexible blocks auto-defend against new collisions; anything else still needs your review.",
  "full-auto": "Find Time schedules, re-plans, and protects your calendar continuously, no review needed.",
};

export function AISettingsTab() {
  const { data: profile, isLoading } = useSettingsAI();
  const updateAI = useUpdateAISettings();

  if (isLoading || !profile) {
    return (
      <div className="flex flex-col gap-3">
        <SkeletonBlock className="h-28 w-full" />
        <SkeletonBlock className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Autonomy level" tone="glass">
        <div className="flex flex-col gap-4">
          <SegmentedControl
            options={AUTONOMY_OPTIONS}
            value={profile.autonomy}
            onChange={(autonomy) => updateAI.mutate({ autonomy })}
          />
          <p className="font-mono text-xs text-white/50">{AUTONOMY_COPY[profile.autonomy]}</p>
        </div>
      </Panel>

      <Panel title="Scheduling feel" tone="glass">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <RangeSlider
            label="Buffer between events"
            min={0}
            max={60}
            step={5}
            value={profile.defaultBufferMin}
            onChange={(v) => updateAI.mutate({ defaultBufferMin: v })}
          />
          <RangeSlider
            label="Minimum focus block"
            min={15}
            max={120}
            step={15}
            value={profile.minFocusBlockMin}
            onChange={(v) => updateAI.mutate({ minFocusBlockMin: v })}
          />
          <RangeSlider
            label="Max daily focus time"
            min={60}
            max={480}
            step={30}
            value={profile.maxDailyFocusMin}
            onChange={(v) => updateAI.mutate({ maxDailyFocusMin: v })}
          />
        </div>
      </Panel>
    </div>
  );
}
