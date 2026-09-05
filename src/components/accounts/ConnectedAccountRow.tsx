import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/ui/Icon";
import { StatusDot } from "@/components/ui/StatusDot";
import { ACCENT_CLASSES, initialsFor } from "@/components/accounts/accent";
import { PROVIDER_META } from "@/components/accounts/providerMeta";
import type { ConnectedAccount } from "@/lib/types";

const STATUS_LABEL: Record<ConnectedAccount["syncStatus"], string> = {
  live: "Live",
  syncing: "Syncing",
  error: "Error",
  paused: "Paused",
  idle: "Idle",
};

export function ConnectedAccountRow({
  account,
  onSyncNow,
  onDisconnect,
  onReconnect,
  className,
}: {
  account: ConnectedAccount;
  onSyncNow?: () => void;
  onDisconnect?: () => void;
  onReconnect?: () => void;
  className?: string;
}) {
  const accent = ACCENT_CLASSES[account.accentColor];
  const provider = PROVIDER_META[account.provider];
  const isError = account.syncStatus === "error";
  const isSyncing = account.syncStatus === "syncing";
  const statusTone = isError ? "alert" : account.syncStatus === "live" ? "live" : isSyncing ? "pending" : "idle";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-card border border-white/10 bg-white/5 px-4 py-3 sm:flex-row sm:items-center",
        isError && "border-ember/30 bg-ember/5",
        className,
      )}
    >
      <div className="relative shrink-0">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full font-mono text-xs font-semibold",
            accent.avatarBg,
            accent.avatarText,
          )}
        >
          {initialsFor(account.displayName || account.email)}
        </span>
        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-ink text-white ring-2 ring-ink">
          <Icon name={provider.icon} size={9} />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", accent.dot)} />
          <p className="truncate font-mono text-sm text-white">{account.displayName}</p>
          <StatusDot tone={statusTone} pulse={isSyncing} />
          <span className="font-mono text-micro uppercase tracking-wider text-white/35">
            {STATUS_LABEL[account.syncStatus]}
          </span>
        </div>
        <p className="truncate font-mono text-xs text-white/45">{account.email}</p>
        {isError && account.syncError && (
          <p className="mt-1 flex items-center gap-1.5 font-mono text-xs text-ember-200">
            <Icon name="solar:danger-triangle-linear" size={13} />
            {account.syncError}
          </p>
        )}
        {account.scopes.length > 0 && (
          <p className="mt-1 truncate font-mono text-micro text-white/30">{account.scopes.join(" · ")}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
        <span className="font-mono text-xs text-white/35">
          {account.messageCount.toLocaleString()} msgs
        </span>
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-wider">
          {isError ? (
            <button
              type="button"
              onClick={onReconnect}
              className="text-lime transition-colors hover:text-lime-hi"
            >
              Reconnect
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onSyncNow}
                disabled={isSyncing}
                className="text-white/50 transition-colors hover:text-white disabled:opacity-40"
              >
                Sync now
              </button>
              <button
                type="button"
                onClick={onDisconnect}
                className="text-white/50 transition-colors hover:text-ember-200"
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
