"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Icon } from "@/components/ui/Icon";
import { Card } from "@/components/ui/Card";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import { useSignals } from "@/lib/hooks/useSignals";
import { SignalCard } from "@/components/signals/SignalCard";
import { formatDuration } from "@/components/tasks/taskUtils";

export function SignalDetailView({ signalId }: { signalId: string }) {
  const { data: signals, isLoading } = useSignals();
  const signal = signals?.find((s) => s.id === signalId);

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6 lg:p-8">
        <SkeletonBlock className="h-6 w-32" />
        <SkeletonBlock className="h-64 w-full" />
      </div>
    );
  }

  if (!signal) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6 lg:p-8">
        <BackLink />
        <EmptyState
          icon="solar:inbox-line-linear"
          eyebrow="Not found"
          message="This signal no longer exists."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6 lg:p-8">
      <BackLink />

      <SignalCard signal={signal} linkToDetail={false} />

      <Card className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-widest text-white/50">Details</p>
        <p className="whitespace-pre-wrap font-mono text-sm text-white/70">{signal.snippet}</p>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Detail label="Received" value={format(new Date(signal.receivedAt), "MMM d, yyyy 'at' HH:mm")} />
          {signal.suggestedDurationMin != null && (
            <Detail label="Est. duration" value={formatDuration(signal.suggestedDurationMin)} />
          )}
          {signal.dueBy && <Detail label="Due by" value={format(new Date(signal.dueBy), "MMM d, yyyy")} />}
          {signal.createdTaskId && (
            <div>
              <dt className="font-mono text-xs uppercase tracking-widest text-white/40">Created task</dt>
              <dd className="mt-0.5">
                <Link href={`/app/tasks/${signal.createdTaskId}`} className="font-mono text-sm text-lime hover:text-lime-hi">
                  View task
                </Link>
              </dd>
            </div>
          )}
        </dl>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-xs uppercase tracking-widest text-white/40">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm text-white">{value}</dd>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/app/signals"
      className="flex w-fit items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-white/50 hover:text-white"
    >
      <Icon name="solar:arrow-left-linear" size={14} />
      Back to signals
    </Link>
  );
}
