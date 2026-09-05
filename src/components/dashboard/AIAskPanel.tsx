"use client";

import * as React from "react";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { Textarea } from "@/components/ui/Field";
import { Chip } from "@/components/ui/Chip";
import { CornerRings } from "@/components/motif/CornerRings";
import { HoloBadge } from "@/components/motif/HoloBadge";
import { useToast } from "@/components/ui/Toast";

const promptSuggestions = ["Plan my week", "What's free this afternoon?", "Prioritize backlog"];

export function AIAskPanel() {
  const { push } = useToast();
  const [prompt, setPrompt] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const handleGenerate = () => {
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    // Full parse → schedule pipeline is a later phase (P9); demo response for now.
    window.setTimeout(() => {
      setSubmitting(false);
      push({ message: "AI planning is coming soon — this will draft a full plan for you.", variant: "success" });
      setPrompt("");
    }, 500);
  };

  return (
    <Card tone="ink" className="relative overflow-hidden">
      <CornerRings />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-lime">
            <Icon name="solar:magic-stick-3-linear" size={20} />
            <span className="font-mono text-xs uppercase tracking-widest">Plan with AI</span>
          </div>
          <h2 className="font-mono text-xl font-medium tracking-tight text-white">
            What are you building?
          </h2>
        </div>
        <HoloBadge label="Beta" />
      </div>

      <p className="relative mt-3 font-mono text-xs leading-relaxed text-white/45">
        Describe the outcome. Find_time will turn it into practical tasks and fit them around your
        calendar.
      </p>

      <div className="relative mt-5 rounded-xl border border-white/10 bg-white/[0.06] p-3 focus-within:border-lime/50">
        <Textarea
          rows={5}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Example: Help me plan a mobile app launch for the end of this month…"
          className="min-h-0 border-none bg-transparent p-0 focus:border-none"
        />
        <div className="mt-3 flex items-center justify-between">
          <IconButton
            icon="solar:microphone-3-linear"
            aria-label="Voice input"
            onClick={() => push({ message: "Voice input is coming soon.", variant: "success" })}
          />
          <button
            className="flex h-9 items-center gap-2 rounded-control bg-lime px-4 font-mono text-xs font-medium text-ink transition-all duration-150 hover:-translate-y-0.5 hover:bg-lime-hi disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleGenerate}
            disabled={!prompt.trim() || submitting}
          >
            {submitting ? "Thinking…" : "Generate plan"}
            <Icon
              name={submitting ? "solar:refresh-circle-linear" : "solar:arrow-right-up-linear"}
              className={submitting ? "animate-spin-once" : undefined}
            />
          </button>
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap gap-2">
        {promptSuggestions.map((suggestion) => (
          <button key={suggestion} type="button" onClick={() => setPrompt(suggestion)}>
            <Chip
              tone="outline"
              className="cursor-pointer normal-case tracking-normal hover:border-white/30 hover:text-white"
            >
              {suggestion}
            </Chip>
          </button>
        ))}
      </div>
    </Card>
  );
}
