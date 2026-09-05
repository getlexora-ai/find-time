import { PhoneMockupCard } from "@/components/motif/PhoneMockupCard";
import { Icon } from "@/components/ui/Icon";
import { aiResponses } from "@/content/voice";

export function AskPanelPhone({ className }: { className?: string }) {
  return (
    <PhoneMockupCard className={className}>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-micro uppercase tracking-wider text-ink/40">Capacity today</p>
        <p className="font-mono text-micro text-ink/60">6h 15m free</p>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
        <div className="h-full w-3/5 rounded-full bg-ember" />
      </div>

      <p className="mb-2 font-mono text-sm font-medium text-ink">
        &ldquo;Plan my week around the Q3 deck deadline&rdquo;
      </p>

      <div className="rounded-xl bg-periwinkle p-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Icon name="solar:stars-minimalistic-linear" size={13} className="text-ink" />
          <span className="font-mono text-micro font-medium uppercase tracking-wider text-ink/70">
            Time found
          </span>
        </div>
        <p className="font-mono text-xs leading-relaxed text-ink">{aiResponses.samplePlan}</p>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-ink/10 pt-3">
        <span className="font-mono text-micro uppercase tracking-wider text-ink/40">
          4 changes · 0 conflicts
        </span>
        <button className="rounded-full bg-ink px-3 py-1.5 font-mono text-micro font-medium uppercase tracking-wider text-white">
          Apply plan
        </button>
      </div>
    </PhoneMockupCard>
  );
}
