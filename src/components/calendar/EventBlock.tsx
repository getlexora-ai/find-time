"use client";

import * as React from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils/cn";
import { CATEGORY_STYLES } from "@/lib/calendar/categoryStyles";
import { formatTimeRange } from "@/lib/calendar/time";
import type { CalendarEvent } from "@/lib/types/event";
import type { ResizeEdge } from "@/lib/hooks/useResizeEvent";

/**
 * The positioned primitive where the standing principle lives: `top`/
 * `height` are passed in verbatim from `layout.ts` + `time.ts` math (real
 * minutes * real px-per-minute) — this component only ever renders the
 * numbers it's given, never reinterprets them. Skin (category color, icon,
 * state ring/dash) is the only thing decided in here.
 */
export interface EventBlockProps {
  event: CalendarEvent;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
  selected?: boolean;
  conflict?: boolean;
  isDragging?: boolean;
  isPast?: boolean;
  isDraft?: boolean;
  draftIndex?: number;
  onSelect?: (event: CalendarEvent, anchorRect: DOMRect) => void;
  onDragPointerDown?: (e: React.PointerEvent) => void;
  onDragPointerMove?: (e: React.PointerEvent) => void;
  onDragPointerUp?: (e: React.PointerEvent) => void;
  onResizePointerDown?: (e: React.PointerEvent, edge: ResizeEdge) => void;
  onResizePointerMove?: (e: React.PointerEvent) => void;
  onResizePointerUp?: (e: React.PointerEvent) => void;
}

export function EventBlock({
  event,
  top,
  height,
  leftPct,
  widthPct,
  selected = false,
  conflict = false,
  isDragging = false,
  isPast = false,
  isDraft = false,
  draftIndex,
  onSelect,
  onDragPointerDown,
  onDragPointerMove,
  onDragPointerUp,
  onResizePointerDown,
  onResizePointerMove,
  onResizePointerUp,
}: EventBlockProps) {
  const style = CATEGORY_STYLES[event.category];
  const protectedState = event.flexibility === "protected";
  const compact = height < 40;
  const tiny = height < 22;

  return (
    <div
      className={cn(
        "absolute overflow-hidden rounded-control font-mono transition-shadow",
        style.block,
        protectedState && "border border-dashed border-white/30",
        conflict && "ring-2 ring-ember",
        selected && "ring-2 ring-lime z-20",
        isDragging && "z-30 scale-[1.01] opacity-70 shadow-panel cursor-grabbing",
        isPast && !isDragging && "opacity-55",
        isDraft && "border border-dashed border-lime bg-lime/10 opacity-90",
      )}
      style={{
        top,
        height: Math.max(height, 6),
        left: `${leftPct}%`,
        width: `calc(${widthPct}% - 3px)`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(event, e.currentTarget.getBoundingClientRect());
      }}
      onPointerDown={onDragPointerDown}
      onPointerMove={onDragPointerMove}
      onPointerUp={onDragPointerUp}
      role="button"
      tabIndex={0}
      aria-label={`${event.title}, ${formatTimeRange(new Date(event.start), new Date(event.end))}`}
    >
      {isDraft && draftIndex != null && (
        <span className="absolute right-1 top-1 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-lime font-mono text-[8px] font-bold text-ink">
          {draftIndex}
        </span>
      )}
      <div className={cn("flex h-full flex-col gap-0.5 px-1.5", tiny ? "py-0.5" : "py-1")}>
        <div className="flex min-w-0 items-center gap-1">
          {!tiny && (
            <span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px]", style.tile)}>
              <Icon name={style.iconName} size={9} />
            </span>
          )}
          <span className="truncate text-micro font-medium text-white/90">{event.title}</span>
        </div>
        {!compact && (
          <span className="truncate text-micro text-white/50">
            {formatTimeRange(new Date(event.start), new Date(event.end))}
          </span>
        )}
      </div>

      {/* resize handles */}
      <div
        className="absolute inset-x-0 top-0 h-1.5 cursor-row-resize"
        onPointerDown={(e) => {
          e.stopPropagation();
          onResizePointerDown?.(e, "start");
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          onResizePointerMove?.(e);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          onResizePointerUp?.(e);
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-1.5 cursor-row-resize"
        onPointerDown={(e) => {
          e.stopPropagation();
          onResizePointerDown?.(e, "end");
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          onResizePointerMove?.(e);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          onResizePointerUp?.(e);
        }}
      />
    </div>
  );
}
