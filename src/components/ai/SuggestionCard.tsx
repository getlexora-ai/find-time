"use client";

import { format } from "date-fns";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils/cn";
import type { AISuggestion } from "@/lib/types";

export function SuggestionCard({ suggestion }: { suggestion: AISuggestion }) {
  const settled = suggestion.status !== "pending";
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-control border border-white/10 bg-white/5 px-4 py-3",
        settled && "opacity-50",
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lime font-mono text-[10px] font-bold text-ink">
        {suggestion.index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-mono text-sm text-white">{suggestion.title}</p>
          <span className="shrink-0 font-mono text-micro text-white/40">
            {format(new Date(suggestion.proposedStart), "EEE, HH:mm")}–{format(new Date(suggestion.proposedEnd), "HH:mm")}
          </span>
        </div>
        <p className="mt-1 font-mono text-xs text-white/55">{suggestion.rationale}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-lime" style={{ width: `${Math.round(suggestion.confidence * 100)}%` }} />
          </div>
          <span className="font-mono text-micro text-white/30">
            {Math.round(suggestion.confidence * 100)}% confidence
          </span>
          {suggestion.displacedFocus && (
            <span className="flex items-center gap-1 font-mono text-micro text-amber">
              <Icon name="solar:danger-triangle-linear" size={11} />
              displaced focus window
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
