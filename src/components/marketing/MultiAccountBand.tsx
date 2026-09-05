import { Icon } from "@/components/ui/Icon";

export function MultiAccountBand() {
  return (
    <div className="px-6 py-20 sm:px-10">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 rounded-card border border-white/10 bg-white/[0.05] px-8 py-12 text-center">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-lime bg-ink font-mono text-xs text-lime">
            AJ
          </span>
          <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-periwinkle bg-ink font-mono text-xs text-periwinkle">
            AR
          </span>
          <Icon name="solar:arrow-right-up-linear" className="rotate-90 text-white/30" />
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-lime text-ink shadow-lime-glow">
            <Icon name="solar:calendar-minimalistic-linear" size={20} />
          </span>
        </div>
        <p className="max-w-md font-mono text-xl font-medium leading-snug text-white">
          Two inboxes, one calendar. Every source stays visually separated — nothing gets confused.
        </p>
        <p className="font-mono text-xs uppercase tracking-eyebrow text-white/45">
          Personal + work Gmail · Todoist · Google Tasks
        </p>
      </div>
    </div>
  );
}
