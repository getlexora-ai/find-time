"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Badge";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { emptyStates } from "@/content/voice";
import type { EmailSignal } from "@/lib/types";

export function SignalsPreviewCard({
  signals,
  loading,
}: {
  signals: EmailSignal[] | undefined;
  loading?: boolean;
}) {
  if (loading) {
    return <SkeletonBlock className="h-28 rounded-2xl" />;
  }

  const newSignals = (signals ?? []).filter((s) => s.status === "new");

  return (
    <Card tone="glass">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white/70">
          <Icon name={emptyStates.signals.icon} size={18} />
          <h3 className="font-mono text-sm font-medium text-white">Signals</h3>
        </div>
        {newSignals.length > 0 && <Badge count={newSignals.length} />}
      </div>

      {newSignals.length === 0 ? (
        <p className="mt-3 font-mono text-xs text-white/40">{emptyStates.signals.message}</p>
      ) : (
        <p className="mt-3 font-mono text-xs leading-relaxed text-white/55">
          {newSignals.length} new signal{newSignals.length === 1 ? "" : "s"} pulled from your inbox —
          review and turn the ones that matter into tasks.
        </p>
      )}

      <Link
        href="/app/signals"
        className="mt-4 flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-lime transition-colors duration-150 hover:text-lime-hi"
      >
        Review signals
        <Icon name="solar:arrow-right-up-linear" size={14} />
      </Link>
    </Card>
  );
}
