"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { Icon } from "@/components/ui/Icon";
import { useConnections } from "@/lib/hooks/useConnections";
import { useSignals } from "@/lib/hooks/useSignals";
import { useGeneratePlan } from "@/lib/hooks/useAIPlan";

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
  const generatePlan = useGeneratePlan();
  const { mutate } = generatePlan;
  const [stageIndex, setStageIndex] = React.useState(0);
  const [planFailed, setPlanFailed] = React.useState(false);
  const planRequested = React.useRef(false);

  React.useEffect(() => {
    // Stages 0-1 are a paced reveal of data we already have; stage 2 gates on the real
    // plan-generation request instead of a fixed delay so "Done" only fires once a
    // PlanDraft actually exists to review.
    if (stageIndex < STAGES.length - 2) {
      const id = window.setTimeout(() => setStageIndex((i) => i + 1), 700);
      return () => window.clearTimeout(id);
    }
    if (stageIndex === STAGES.length - 2 && !planRequested.current) {
      planRequested.current = true;
      mutate(undefined, {
        onSuccess: () => setStageIndex((i) => i + 1),
        onError: () => {
          setPlanFailed(true);
          setStageIndex((i) => i + 1);
        },
      });
    }
  }, [stageIndex, mutate]);

  const done = stageIndex === STAGES.length - 1;
  const accountCount = connections?.accounts.length ?? 0;
  const signalCount = signals?.length ?? 0;

  const subtitle = done
    ? planFailed
      ? "We couldn't build a draft — you can try again any time from AI Sessions."
      : "Applied nothing yet — review it any time from Today or AI Sessions."
    : undefined;

  return (
    <OnboardingLayout
      step="first-plan"
      title={done ? (planFailed ? "Setup complete." : "Your plan is ready.") : "Building your first plan."}
      subtitle={subtitle}
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
