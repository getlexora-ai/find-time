import { cn } from "@/lib/utils/cn";

export function ProgressMeter({
  value,
  label,
  delta,
  className,
}: {
  /** 0-100 */
  value: number;
  label?: string;
  delta?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {(label || delta) && (
        <div className="flex items-baseline justify-between">
          {label && <span className="font-mono text-xs uppercase tracking-widest text-white/55">{label}</span>}
          {delta && <span className="font-mono text-xs text-lime">{delta}</span>}
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-lime transition-[width] duration-300"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}
