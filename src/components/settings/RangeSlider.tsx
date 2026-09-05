import { cn } from "@/lib/utils/cn";

export function RangeSlider({
  label,
  value,
  min,
  max,
  step = 5,
  unit = "min",
  onChange,
  className,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-xs uppercase tracking-widest text-white/55">{label}</span>
        <span className="font-mono text-xs text-lime">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-lime"
      />
    </div>
  );
}
