"use client";

import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";

export function DraftModeBanner({
  changeCount,
  conflictCount,
  applying,
  onApply,
  onDiscard,
}: {
  changeCount: number;
  conflictCount: number;
  applying: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-lime/30 bg-ink/95 px-4 py-2.5 blur-bar sm:px-6">
      <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-lime">
        <Icon name="solar:magic-stick-3-linear" size={14} />
        <span>
          Draft plan · {String(changeCount).padStart(2, "0")} changes · {String(conflictCount).padStart(2, "0")}{" "}
          conflicts
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscard} disabled={applying}>
          Discard
        </Button>
        <Button size="sm" onClick={onApply} loading={applying}>
          Apply all
        </Button>
      </div>
    </div>
  );
}
