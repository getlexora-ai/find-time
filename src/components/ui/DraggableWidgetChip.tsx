"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";

type Tone = "lime" | "ember" | "ink" | "blue";

const toneClasses: Record<Tone, string> = {
  lime: "bg-lime text-ink",
  ember: "bg-ember text-white",
  ink: "bg-ink text-white border border-white/10",
  blue: "bg-blue-700 text-white border border-white/10",
};

export function DraggableWidgetChip({
  tone = "ink",
  initial,
  float = "slow",
  storageKey,
  children,
  className,
}: {
  tone?: Tone;
  initial: { x: number; y: number };
  float?: "slow" | "fast" | "none";
  storageKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState(initial);
  const dragging = React.useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const reducedMotion = useReducedMotion();

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) setPos(JSON.parse(stored));
    } catch {
      // localStorage unavailable — keep the default position
    }
  }, [storageKey]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragging.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragging.current.startX;
    const dy = e.clientY - dragging.current.startY;
    setPos({ x: dragging.current.origX + dx, y: dragging.current.origY + dy });
  };
  const onPointerUp = () => {
    dragging.current = null;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(pos));
    } catch {
      // localStorage unavailable — position just won't persist
    }
  };

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={cn(
        "absolute cursor-grab touch-none select-none rounded-xl px-4 py-3 shadow-panel active:cursor-grabbing",
        !reducedMotion && float === "slow" && "animate-float-slow",
        !reducedMotion && float === "fast" && "animate-float-fast",
        toneClasses[tone],
        className,
      )}
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
    >
      {children}
    </div>
  );
}
