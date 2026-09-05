"use client";

import { cn } from "@/lib/utils/cn";
import { NOTIFICATION_FILTERS, type NotificationFilterKey } from "./notificationMeta";

export function NotificationFilterChips({
  value,
  onChange,
}: {
  value: NotificationFilterKey;
  onChange: (key: NotificationFilterKey) => void;
}) {
  return (
    <div role="tablist" aria-label="Filter notifications by type" className="flex flex-wrap gap-2">
      {NOTIFICATION_FILTERS.map((f) => {
        const active = f.key === value;
        return (
          <button
            key={f.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(f.key)}
            className={cn(
              "rounded-full px-3 py-1.5 font-mono text-micro font-medium uppercase tracking-wider transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/60",
              active
                ? "bg-lime text-ink"
                : "border border-white/15 bg-transparent text-white/60 hover:text-white",
            )}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
