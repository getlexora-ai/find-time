"use client";

import { format } from "date-fns";
import { AIAskPanel } from "@/components/dashboard/AIAskPanel";
import { SuggestionCard } from "@/components/ai/SuggestionCard";
import { Panel } from "@/components/ui/Panel";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { useToast } from "@/components/ui/Toast";
import { useDrafts, useDraft, useApplyDraft, useDiscardDraft, useUndoDraft } from "@/lib/hooks/useAIPlan";
import type { PlanDraft } from "@/lib/types";

function statusTone(status: PlanDraft["status"]) {
  if (status === "pending") return "lime" as const;
  if (status === "applied") return "periwinkle" as const;
  return "outline" as const;
}

export default function AISessionsPage() {
  const { push } = useToast();
  const { data: drafts, isLoading } = useDrafts();
  const activeDraft = drafts?.find((d) => d.status === "pending") ?? null;
  const { data: activeData } = useDraft(activeDraft?.id ?? null);
  const applyDraft = useApplyDraft();
  const discardDraft = useDiscardDraft();
  const undoDraft = useUndoDraft();

  const onApply = () => {
    if (!activeDraft) return;
    const id = activeDraft.id;
    applyDraft.mutate(id, {
      onSuccess: () =>
        push({
          message: "Plan applied to your calendar",
          variant: "undo",
          actionLabel: "Undo",
          onAction: () => undoDraft.mutate(id),
        }),
    });
  };

  const onDiscard = () => {
    if (!activeDraft) return;
    discardDraft.mutate(activeDraft.id, { onSuccess: () => push({ message: "Draft discarded", variant: "alert" }) });
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-lime">AI Sessions</p>
        <h1 className="mt-1 font-mono text-2xl font-medium text-white">Plan with AI</h1>
      </div>

      <AIAskPanel />

      {activeDraft && activeData && (
        <Panel
          title="Draft plan"
          eyebrowChip={<Chip tone="lime">Pending review</Chip>}
          footer={
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-white/40">
                {activeDraft.changeCount} changes · {activeDraft.conflictCount} conflicts
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={onDiscard}>
                  Discard
                </Button>
                <Button size="sm" onClick={onApply} loading={applyDraft.isPending}>
                  Apply all
                </Button>
              </div>
            </div>
          }
        >
          <div className="flex flex-col gap-2">
            {activeData.suggestions.map((s) => (
              <SuggestionCard key={s.id} suggestion={s} />
            ))}
            {activeDraft.conflicts.map((c) => (
              <div key={c.id} className="rounded-control border border-ember/30 bg-ember/10 px-4 py-3">
                <p className="font-mono text-xs text-ember-200">{c.message}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {c.fallbacks.map((f) => (
                    <Chip key={f.action} tone="ember">
                      {f.label}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div>
        <p className="mb-3 font-mono text-xs uppercase tracking-widest text-white/40">History</p>
        {isLoading ? (
          <SkeletonBlock className="h-24 w-full" />
        ) : !drafts?.length ? (
          <EmptyState
            icon="solar:magic-stick-3-linear"
            eyebrow="No plans yet"
            message="Ask AI to plan your week and your drafts will show up here."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {drafts.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-control border border-white/10 bg-white/5 px-4 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <Chip tone={statusTone(d.status)}>{d.status}</Chip>
                  <span className="font-mono text-xs text-white/60">
                    {format(new Date(d.createdAt), "MMM d, HH:mm")}
                  </span>
                </div>
                <span className="font-mono text-micro text-white/35">
                  {d.changeCount} changes · {d.conflictCount} conflicts
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
