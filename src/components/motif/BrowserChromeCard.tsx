import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/ui/Icon";

export function BrowserChromeCard({
  url,
  actions,
  tone = "dark",
  children,
  className,
}: {
  url: string;
  actions?: React.ReactNode;
  tone?: "dark" | "paper";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-card border shadow-panel",
        tone === "dark" ? "border-white/20 bg-ink/90 blur-surface" : "border-ink/10 bg-paper",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 border-b px-4 py-3",
          tone === "dark" ? "border-white/10" : "border-ink/10",
        )}
      >
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ember" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber" />
          <span className="h-2.5 w-2.5 rounded-full bg-lime" />
        </div>
        <div
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-full border px-3 py-1 font-mono text-micro tracking-wider",
            tone === "dark"
              ? "border-white/10 text-white/40"
              : "border-ink/10 text-ink/40",
          )}
        >
          <Icon name="solar:lock-keyhole-minimalistic-linear" size={11} />
          <span>{url}</span>
        </div>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
