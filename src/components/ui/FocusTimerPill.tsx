"use client";

import * as React from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils/cn";

export function FocusTimerPill({ className }: { className?: string }) {
  const [running, setRunning] = React.useState(false);
  const [seconds, setSeconds] = React.useState(25 * 60);

  React.useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-full bg-ink px-4 py-2.5 shadow-panel",
        className,
      )}
    >
      <Icon name="solar:alarm-play-linear" className="text-lime" />
      <div className="font-mono text-xs">
        <p className="uppercase tracking-widest text-white/50">Focus mode</p>
        <p className="text-white">
          {mm}:{ss} {running ? "active" : "ready"}
        </p>
      </div>
      <button
        onClick={() => setRunning((r) => !r)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-ink"
        aria-label={running ? "Pause focus timer" : "Start focus timer"}
      >
        <Icon name={running ? "solar:pause-linear" : "solar:play-linear"} size={14} />
      </button>
    </div>
  );
}
