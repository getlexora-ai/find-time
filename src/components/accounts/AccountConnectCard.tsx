"use client";

import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/ui/Icon";
import { Chip } from "@/components/ui/Chip";

export function AccountConnectCard({
  label,
  icon,
  description,
  soon,
  connecting,
  onClick,
}: {
  label: string;
  icon: string;
  description: string;
  soon?: boolean;
  connecting?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={soon || connecting}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-3 rounded-card border border-white/10 bg-white/5 p-4 text-left transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/60",
        !soon && !connecting && "hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/10",
        soon && "cursor-not-allowed opacity-50",
        connecting && "border-lime/40",
      )}
    >
      <div className="flex w-full items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-control bg-white/10 text-white">
          <Icon name={icon} size={18} />
        </span>
        {soon && <Chip tone="outline">Soon</Chip>}
      </div>
      <div>
        <p className="font-mono text-sm text-white">{label}</p>
        <p className="mt-0.5 font-mono text-xs text-white/45">{description}</p>
      </div>
      {connecting && (
        <span className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-lime">
          <Icon name="solar:refresh-circle-linear" size={13} className="animate-spin-once" />
          Connecting…
        </span>
      )}
    </button>
  );
}
