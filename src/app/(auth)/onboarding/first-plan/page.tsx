"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { Icon } from "@/components/ui/Icon";
import { useConnections } from "@/lib/hooks/useConnections";
import { useSignals } from "@/lib/hooks/useSignals";

const STAGES = [
  "Scanning connected accounts…",
  "Extracting signals from your inbox…",
  "Building your plan…",
  "Done.",
];

export default function OnboardingFirstPlanPage() {
  const router = useRouter();
  const { data: connections } = useConnections();
  const { data: signals } = useSignals();
  const [stageIndex, setStageIndex] = React.useState(0);

  React.useEffect(() => {
    if (stageIndex >= STAGES.length - 1) return;
    const id = window.setTimeout(() => setStageIndex((i) => i + 1), 900);
    return () => window.clearTimeout(id);
  }, [stageIndex]);

  const done = stageIndex === STAGES.length - 1;
  const accountCount = connections?.accounts.length ?? 0;
  const signalCount = signals?.length ?? 0;

  return (
    <OnboardingLayout
      step="first-plan"
      title={done ? "Your plan is ready." : "Building your first plan."}
      subtitle={done ? "Applied nothing yet — review it any time from Today or AI Sessions." : undefined}
      onContinue={() => router.push("/app/today")}
      continueLabel="Go to Today"
      continueDisabled={!done}
    >
      <div className="flex flex-col gap-2">
        {STAGES.slice(0, stageIndex + 1).map((stage, i) => {
          const isLast = i === stageIndex;
          let label = stage;
          if (i === 0) label = `Scanning ${accountCount} account${accountCount === 1 ? "" : "s"}…`;
          if (i === 1) label = `${signalCount} signal${signalCount === 1 ? "" : "s"} found`;
          return (
            <div
              key={i}
              className="flex items-center gap-2.5 rounded-control border border-white/10 bg-white/5 px-4 py-3 font-mono text-xs"
            >
              <Icon
                name={isLast && !done ? "solar:refresh-linear" : "solar:check-circle-linear"}
                size={14}
                className={isLast && !done ? "animate-spin-once text-white/50" : "text-lime"}
              />
              <span className={isLast && !done ? "text-white/50" : "text-white/80"}>{label}</span>
            </div>
          );
        })}
      </div>
    </OnboardingLayout>
  );
}
