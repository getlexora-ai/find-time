import { cn } from "@/lib/utils/cn";

export function AxisMarkers({ items, className }: { items: string[]; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 font-mono text-micro uppercase tracking-wider text-white/30", className)}>
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

export function TelemetryRow({ items, className }: { items: string[]; className?: string }) {
  return (
    <div className={cn("font-mono text-xs text-white/35", className)}>
      {items.join(" · ")}
    </div>
  );
}
