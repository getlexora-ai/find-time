import * as React from "react";
import { cn } from "@/lib/utils/cn";

export function Panel({
  title,
  eyebrowChip,
  actions,
  footer,
  tone = "glass",
  children,
  className,
}: {
  title: string;
  eyebrowChip?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  tone?: "glass" | "paper";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-card shadow-panel",
        tone === "glass"
          ? "border border-white/10 bg-white/[0.07] blur-surface"
          : "border border-ink/10 bg-paper",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-3 border-b px-5 py-4",
          tone === "glass" ? "border-white/10" : "border-ink/10",
        )}
      >
        <div className="flex items-center gap-2">
          <h2
            className={cn(
              "font-mono text-lg font-medium tracking-tight",
              tone === "glass" ? "text-white" : "text-ink",
            )}
          >
            {title}
          </h2>
          {eyebrowChip}
        </div>
        {actions}
      </div>
      <div className="p-5">{children}</div>
      {footer && (
        <div
          className={cn(
            "border-t px-5 py-3",
            tone === "glass" ? "border-white/10" : "border-ink/10",
          )}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
