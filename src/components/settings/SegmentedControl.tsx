import { cn } from "@/lib/utils/cn";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex w-full flex-wrap gap-1 rounded-control border border-white/10 bg-white/5 p-1", className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "min-w-0 flex-1 rounded-control px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors",
            value === opt.value ? "bg-lime text-ink" : "text-white/55 hover:text-white",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
