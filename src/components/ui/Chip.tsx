import * as React from "react";
import { cn } from "@/lib/utils/cn";

type Tone = "lime" | "periwinkle" | "ember" | "amber" | "paper" | "outline";

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  as?: "span" | "button";
}

const toneClasses: Record<Tone, string> = {
  lime: "bg-lime text-ink",
  periwinkle: "bg-periwinkle text-ink",
  ember: "bg-ember/15 text-ember-200 border border-ember/30",
  amber: "bg-amber text-ink",
  paper: "bg-white text-ink border border-ink/15",
  outline: "bg-transparent text-white/70 border border-white/15",
};

export function Chip({ tone = "outline", className, children, ...rest }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-micro font-medium uppercase tracking-wider",
        toneClasses[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
