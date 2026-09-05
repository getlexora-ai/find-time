"use client";

import { useConnections } from "@/lib/hooks/useConnections";
import { useConnectionActions } from "@/components/accounts/useConnectionActions";
import { ACCENT_CLASSES } from "@/components/accounts/accent";
import { Switch } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils/cn";
import type { ConnectedAccount } from "@/lib/types";

export function CalendarsSettingsTab() {
  const { data, isLoading } = useConnections();
  const { setCalendarFlags, setWriteTarget } = useConnectionActions();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <SkeletonBlock className="h-24 w-full" />
        <SkeletonBlock className="h-24 w-full" />
      </div>
    );
  }

  const accounts = data?.accounts ?? [];
  const calendars = data?.calendars ?? [];

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon="solar:calendar-minimalistic-linear"
        eyebrow="No calendars yet"
        message="Connect an account in Settings > Accounts to see its calendars here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {accounts.map((account: ConnectedAccount) => {
        const accountCalendars = calendars.filter((c) => c.connectedAccountId === account.id);
        if (accountCalendars.length === 0) return null;
        const accent = ACCENT_CLASSES[account.accentColor];
        return (
          <div key={account.id} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className={cn("h-1.5 w-1.5 rounded-full", accent.dot)} />
              <p className="font-mono text-xs uppercase tracking-widest text-white/45">
                {account.displayName} · {account.email}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {accountCalendars.map((cal) => (
                <div
                  key={cal.id}
                  className="flex flex-col gap-3 rounded-card border border-white/10 bg-white/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-mono text-sm text-white">{cal.name}</p>
                    <p className="font-mono text-xs text-white/40">{cal.timezone}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-5">
                    <label className="flex items-center gap-2 font-mono text-xs text-white/55">
                      <Switch
                        checked={cal.readEnabled}
                        onCheckedChange={(v) => setCalendarFlags(cal.id, { readEnabled: v })}
                      />
                      Read
                    </label>
                    <label className="flex items-center gap-2 font-mono text-xs text-white/55">
                      <Switch
                        checked={cal.writeEnabled}
                        onCheckedChange={(v) => setCalendarFlags(cal.id, { writeEnabled: v })}
                      />
                      Write
                    </label>
                    <button
                      type="button"
                      disabled={!cal.writeEnabled}
                      onClick={() => setWriteTarget(cal.id)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-micro uppercase tracking-wider transition-colors",
                        cal.isWriteTarget
                          ? "border-lime bg-lime text-ink"
                          : "border-white/15 text-white/45 hover:text-white",
                        !cal.writeEnabled && "cursor-not-allowed opacity-30",
                      )}
                    >
                      <Icon
                        name={cal.isWriteTarget ? "solar:check-circle-linear" : "solar:record-circle-linear"}
                        size={12}
                      />
                      Write target
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
