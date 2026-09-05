"use client";

import * as React from "react";
import { BrowserChromeCard } from "@/components/motif/BrowserChromeCard";
import { IconButton } from "@/components/ui/IconButton";
import { Icon } from "@/components/ui/Icon";

const rows = [
  { time: "08:00", title: "Spanish practice", meta: "35 min · Learning", tone: "bg-lime/70" },
  { time: "09:00", title: "Design review", meta: "45 min · Meeting", tone: "bg-white" },
  { time: "10:30", title: "Q3 deck — deep work", meta: "90 min · Deep work", tone: "bg-lime" },
  { time: "12:15", title: "Recovery break", meta: "15 min", tone: "bg-paper-sunk", dashed: true },
  { time: "13:00", title: "Inbox batch", meta: "20 min · Admin", tone: "bg-amber" },
];

export function PlannerPreviewCard({ className }: { className?: string }) {
  const [spinning, setSpinning] = React.useState(false);

  return (
    <BrowserChromeCard
      url="APP.FINDTIME.AI / DASHBOARD"
      tone="paper"
      className={className}
      actions={
        <IconButton
          icon="solar:refresh-linear"
          aria-label="Regenerate plan"
          tone="on-paper"
          className={spinning ? "animate-spin-once" : undefined}
          onClick={() => {
            setSpinning(true);
            window.setTimeout(() => setSpinning(false), 650);
          }}
        />
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-widest text-ink/50">Today · Sep 04</p>
        <span className="font-mono text-micro uppercase tracking-wider text-lime-hi">AI balanced</span>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.time} className="grid grid-cols-[3.25rem_1fr] items-center gap-3">
            <span className="font-mono text-micro text-ink/40">{row.time}</span>
            <div
              className={`flex items-center justify-between rounded-lg px-3 py-2 ${row.dashed ? "border border-dashed border-ink/15" : "border border-ink/10"} ${row.tone}`}
            >
              <span className="font-mono text-xs text-ink">{row.title}</span>
              <span className="font-mono text-micro text-ink/45">{row.meta}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-ink/10 pt-3">
        <span className="font-mono text-micro uppercase tracking-wider text-ink/40">
          90M buffer protected
        </span>
        <button className="flex items-center gap-1 font-mono text-micro uppercase tracking-wider text-ink/60">
          <Icon name="solar:add-circle-linear" size={13} />
          Add task
        </button>
      </div>
    </BrowserChromeCard>
  );
}
