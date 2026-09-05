import * as React from "react";
import { cn } from "@/lib/utils/cn";

export function PhoneMockupCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative w-72 overflow-hidden rounded-[2rem] border-[6px] border-ink bg-paper shadow-panel",
        className,
      )}
    >
      <div className="absolute inset-0 -z-0 opacity-[0.06]">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full border-2 border-ember" />
      </div>
      <div className="relative flex items-center justify-between px-5 pb-1 pt-3 font-mono text-micro text-ink/60">
        <span>9:41</span>
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full border border-ink/30" />
          <span className="h-2 w-3 rounded-sm border border-ink/30" />
        </div>
      </div>
      <div className="absolute left-1/2 top-2.5 h-1.5 w-16 -translate-x-1/2 rounded-full bg-ink/20" />
      <div className="relative px-4 pb-5 pt-2">{children}</div>
    </div>
  );
}
