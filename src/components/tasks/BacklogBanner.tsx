"use client";

import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatDuration } from "@/components/tasks/taskUtils";

export function BacklogBanner({ count, totalMin }: { count: number; totalMin: number }) {
  const { push } = useToast();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-dashed border-lime/30 bg-lime/[0.06] px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lime/15 text-lime">
          <Icon name="solar:box-minimalistic-linear" size={18} />
        </span>
        <p className="font-mono text-sm text-white">
          {count} {count === 1 ? "task" : "tasks"} unscheduled · {formatDuration(totalMin)} of work
        </p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        icon="solar:magic-stick-3-linear"
        onClick={() => push({ message: "Coming soon — needs the AI scheduler" })}
      >
        Find time for all
      </Button>
    </div>
  );
}
