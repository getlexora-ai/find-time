import { cn } from "@/lib/utils/cn";

export function HoloBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "animate-holo-shimmer rounded-full px-2.5 py-1 font-mono text-micro font-medium uppercase tracking-wider text-ink",
        className,
      )}
      style={{
        backgroundImage:
          "linear-gradient(120deg, #CCFF00, #C8C8FF, #CCFF00)",
      }}
    >
      {label}
    </span>
  );
}
