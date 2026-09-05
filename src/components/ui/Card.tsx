import * as React from "react";
import { cn } from "@/lib/utils/cn";

type Tone = "glass" | "ink" | "paper" | "periwinkle";

const toneClasses: Record<Tone, string> = {
  glass: "bg-white/[0.07] border border-white/10 blur-surface",
  ink: "bg-ink border border-white/10",
  paper: "bg-white border border-ink/10 text-ink",
  periwinkle: "bg-periwinkle border border-ink/10 text-ink",
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  hoverLift?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ tone = "glass", hoverLift = false, className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-xl p-5",
        toneClasses[tone],
        hoverLift && "hover-lift",
        className,
      )}
      {...rest}
    />
  ),
);
Card.displayName = "Card";

export function StatCard({
  label,
  value,
  delta,
  icon,
  className,
}: {
  label: string;
  value: string;
  delta?: string;
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-widest text-white/55">{label}</p>
        {icon}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="font-mono text-2xl font-medium tracking-tight text-white">{value}</p>
        {delta && <p className="font-mono text-xs text-lime">{delta}</p>}
      </div>
    </Card>
  );
}
