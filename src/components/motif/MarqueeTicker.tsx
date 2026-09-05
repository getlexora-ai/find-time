"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";

export function MarqueeTicker({
  items,
  speed = 0.4,
  tone = "lime",
  className,
}: {
  items: string[];
  /** px per frame */
  speed?: number;
  tone?: "lime" | "muted";
  className?: string;
}) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [paused, setPaused] = React.useState(false);
  const reducedMotion = useReducedMotion();
  const offset = React.useRef(0);

  React.useEffect(() => {
    if (reducedMotion) return;
    let raf: number;
    const step = () => {
      const el = trackRef.current;
      if (el && !paused) {
        offset.current -= speed;
        const half = el.scrollWidth / 2;
        if (Math.abs(offset.current) >= half) offset.current = 0;
        el.style.transform = `translateX(${offset.current}px)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [paused, speed, reducedMotion]);

  const content = items.join("  //  ") + "  //  ";

  return (
    <div
      className={cn(
        "overflow-hidden whitespace-nowrap border-b border-white/10 py-2",
        tone === "lime" ? "bg-blue-750/30 blur-surface" : "bg-transparent",
        className,
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div ref={trackRef} className="marquee-track">
        {[0, 1].map((dup) => (
          <span
            key={dup}
            className={cn(
              "px-4 font-mono text-xs uppercase tracking-ticker",
              tone === "lime" ? "text-lime" : "text-white/40",
            )}
          >
            {content}
          </span>
        ))}
      </div>
    </div>
  );
}
