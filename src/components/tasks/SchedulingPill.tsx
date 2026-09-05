import { cn } from "@/lib/utils/cn";
import type { SchedulingState } from "@/components/tasks/taskUtils";

const toneClasses: Record<SchedulingState, string> = {
  UNSCHEDULED: "border border-white/15 text-white/45",
  SCHEDULED: "bg-periwinkle text-ink",
  DONE: "bg-lime text-ink",
};

export function SchedulingPill({ state, className }: { state: SchedulingState; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-mono text-micro font-medium uppercase tracking-wider",
        toneClasses[state],
        className,
      )}
    >
      {state}
    </span>
  );
}
