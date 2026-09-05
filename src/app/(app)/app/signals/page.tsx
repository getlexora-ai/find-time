"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSignals } from "@/lib/hooks/useSignals";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/queryKeys";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { emptyStates } from "@/content/voice";
import { SignalCard } from "@/components/signals/SignalCard";
import { isLowConfidence } from "@/components/signals/signalUtils";
import type { ConnectedAccount } from "@/lib/types";

export default function SignalsPage() {
  const { data: signals, isLoading } = useSignals();
  const { data: accounts } = useQuery({
    queryKey: queryKeys.connections,
    queryFn: () => api.get<{ accounts: ConnectedAccount[] }>("/api/connections").then((r) => r.accounts),
  });
  const [showLowConfidence, setShowLowConfidence] = React.useState(false);

  const accountsById = React.useMemo(
    () => new Map((accounts ?? []).map((a) => [a.id, a])),
    [accounts],
  );

  const grouped = React.useMemo(() => {
    const main = (signals ?? []).filter((s) => !isLowConfidence(s));
    const groups = new Map<string, typeof main>();
    for (const s of main) {
      const list = groups.get(s.connectedAccountId) ?? [];
      list.push(s);
      groups.set(s.connectedAccountId, list);
    }
    return groups;
  }, [signals]);

  const lowConfidence = React.useMemo(
    () => (signals ?? []).filter((s) => isLowConfidence(s)),
    [signals],
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 lg:p-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-lime">Signals</p>
        <h1 className="mt-1 font-mono text-2xl font-medium tracking-tight text-white">
          What your inbox is asking of you
        </h1>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-40 w-full" />
          ))}
        </div>
      )}

      {!isLoading && (signals?.length ?? 0) === 0 && (
        <EmptyState
          icon={emptyStates.signals.icon}
          eyebrow={emptyStates.signals.eyebrow}
          message={emptyStates.signals.message}
          ctaLabel={emptyStates.signals.ctaLabel}
        />
      )}

      {!isLoading && (signals?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-8">
          {Array.from(grouped.entries()).map(([accountId, list]) => (
            <div key={accountId} className="flex flex-col gap-3">
              <div className="flex items-center gap-2 px-1">
                <Icon name="solar:letter-linear" size={14} className="text-white/40" />
                <p className="font-mono text-xs uppercase tracking-widest text-white/50">
                  {accountsById.get(accountId)?.displayName ?? accountsById.get(accountId)?.email ?? accountId}
                </p>
                <span className="font-mono text-micro text-white/30">{String(list.length).padStart(2, "0")}</span>
              </div>
              <div className="flex flex-col gap-3">
                {list.map((signal) => (
                  <SignalCard key={signal.id} signal={signal} />
                ))}
              </div>
            </div>
          ))}

          {lowConfidence.length > 0 && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setShowLowConfidence((v) => !v)}
                className="flex w-fit items-center gap-2 px-1 font-mono text-xs uppercase tracking-widest text-white/40 hover:text-white/70"
              >
                <Icon
                  name={showLowConfidence ? "solar:alt-arrow-down-linear" : "solar:alt-arrow-right-linear"}
                  size={13}
                />
                Low confidence
                <span className="font-mono text-micro text-white/30">
                  {String(lowConfidence.length).padStart(2, "0")}
                </span>
              </button>
              {showLowConfidence && (
                <div className="flex flex-col gap-3 opacity-75">
                  {lowConfidence.map((signal) => (
                    <SignalCard key={signal.id} signal={signal} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
