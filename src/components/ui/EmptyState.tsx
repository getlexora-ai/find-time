import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";

export function EmptyState({
  icon,
  eyebrow,
  message,
  ctaLabel,
  onCta,
}: {
  icon: string;
  eyebrow: string;
  message: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/15 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-white/20 text-white/40">
        <Icon name={icon} size={22} />
      </div>
      <p className="font-mono text-xs uppercase tracking-widest text-white/40">{eyebrow}</p>
      <p className="max-w-xs font-mono text-sm text-white/60">{message}</p>
      {ctaLabel && onCta && (
        <Button size="sm" variant="ghost" onClick={onCta}>
          {ctaLabel}
        </Button>
      )}
    </div>
  );
}
