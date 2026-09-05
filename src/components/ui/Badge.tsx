import { cn } from "@/lib/utils/cn";

export function Badge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-lime px-1 font-mono text-micro font-semibold text-ink",
        className,
      )}
    >
      {String(count).padStart(2, "0")}
    </span>
  );
}

export function Dot({ tone = "ember", className }: { tone?: "ember" | "lime" | "amber"; className?: string }) {
  const toneClasses = {
    ember: "bg-ember",
    lime: "bg-lime",
    amber: "bg-amber",
  } as const;
  return <span className={cn("h-1.5 w-1.5 rounded-full", toneClasses[tone], className)} />;
}
