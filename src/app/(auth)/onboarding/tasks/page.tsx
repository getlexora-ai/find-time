"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { Textarea } from "@/components/ui/Field";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { useCreateTask } from "@/lib/hooks/useTasks";

const SOURCES = [
  { label: "Todoist", icon: "solar:checklist-minimalistic-linear" },
  { label: "Google Tasks", icon: "solar:checklist-minimalistic-linear" },
  { label: "Notion", icon: "solar:notebook-linear" },
];

export default function OnboardingTasksPage() {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const createTask = useCreateTask();

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const handleContinue = async () => {
    await Promise.all(lines.map((title) => createTask.mutateAsync({ title, durationMin: 30 })));
    router.push("/onboarding/first-plan");
  };

  return (
    <OnboardingLayout
      step="tasks"
      title="Bring your to-dos."
      subtitle="Connect a task source, or paste a plain list — one per line."
      onContinue={handleContinue}
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-2">
          {SOURCES.map((s) => (
            <div
              key={s.label}
              className="flex flex-col items-center gap-2 rounded-control border border-white/10 bg-white/5 px-3 py-4 opacity-50"
            >
              <Icon name={s.icon} className="text-white/50" />
              <span className="font-mono text-micro text-white/60">{s.label}</span>
              <Chip tone="outline" className="text-micro">
                Soon
              </Chip>
            </div>
          ))}
        </div>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Finalize launch pricing copy\nRenew passport\nReview Q3 budget spreadsheet"}
          className="min-h-32"
        />

        {lines.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="font-mono text-micro uppercase tracking-wider text-white/40">
              {lines.length} task{lines.length === 1 ? "" : "s"} to add
            </p>
            {lines.map((line, i) => (
              <div key={i} className="rounded-control border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white/75">
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </OnboardingLayout>
  );
}
