"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BracketFrame } from "@/components/motif/BracketFrame";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

const STEPS = ["welcome", "accounts", "schedule", "tasks", "first-plan"] as const;
export type OnboardingStep = (typeof STEPS)[number];

const STEP_PATH: Record<OnboardingStep, string> = {
  welcome: "/onboarding/welcome",
  accounts: "/onboarding/accounts",
  schedule: "/onboarding/schedule",
  tasks: "/onboarding/tasks",
  "first-plan": "/onboarding/first-plan",
};

export function OnboardingLayout({
  step,
  title,
  subtitle,
  onContinue,
  continueLabel = "Continue",
  continueDisabled = false,
  hideFooter = false,
  wide = false,
  children,
}: {
  step: OnboardingStep;
  title: string;
  subtitle?: string;
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  hideFooter?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const index = STEPS.indexOf(step);

  const goNext = () => {
    if (onContinue) {
      onContinue();
      return;
    }
    const next = STEPS[index + 1];
    router.push(next ? STEP_PATH[next] : "/app/today");
  };

  const goBack = () => {
    const prev = STEPS[index - 1];
    if (prev) router.push(STEP_PATH[prev]);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12 sm:px-6">
      <BracketFrame variant="app" />
      <div className={cn("w-full", wide ? "max-w-2xl" : "max-w-lg")}>
        <div className="mb-8 flex items-center justify-between">
          <p className="font-mono text-xs uppercase tracking-eyebrow text-lime">
            Step.{String(index + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
          </p>
          <button
            onClick={() => router.push("/app/today")}
            className="font-mono text-micro uppercase tracking-wider text-white/40 hover:text-white"
          >
            Skip
          </button>
        </div>
        <div className="mb-8 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-lime transition-all duration-300"
            style={{ width: `${((index + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <h1 className="font-mono text-2xl font-medium tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-2 font-mono text-sm text-white/55">{subtitle}</p>}

        <div className="mt-8">{children}</div>

        {!hideFooter && (
          <div className="mt-8 flex items-center justify-between">
            <Button variant="quiet" size="sm" onClick={goBack} disabled={index === 0}>
              Back
            </Button>
            <Button size="sm" onClick={goNext} disabled={continueDisabled}>
              {continueLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
