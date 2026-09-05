import { cn } from "@/lib/utils/cn";

type Tone = "live" | "alert" | "pending" | "idle";

const toneClasses: Record<Tone, string> = {
  live: "bg-lime shadow-dot",
  alert: "bg-ember",
  pending: "bg-amber",
  idle: "bg-white/30",
};

export function StatusDot({
  tone = "idle",
  pulse = false,
  className,
}: {
  tone?: Tone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex h-2 w-2", className)}>
      {pulse && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-pulse-ring rounded-full",
            toneClasses[tone],
          )}
        />
      )}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", toneClasses[tone])} />
    </span>
  );
}
