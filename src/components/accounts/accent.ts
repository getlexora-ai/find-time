import type { ConnectedAccount } from "@/lib/types";

/**
 * Display classes for the auto-assigned accent color chain
 * (lime -> periwinkle -> ember -> amber -> white), per PLAN.md §3.1.
 */
export const ACCENT_CLASSES: Record<
  ConnectedAccount["accentColor"],
  { dot: string; text: string; ring: string; avatarBg: string; avatarText: string }
> = {
  lime: {
    dot: "bg-lime",
    text: "text-lime",
    ring: "ring-lime/40",
    avatarBg: "bg-lime",
    avatarText: "text-ink",
  },
  periwinkle: {
    dot: "bg-periwinkle",
    text: "text-periwinkle",
    ring: "ring-periwinkle/40",
    avatarBg: "bg-periwinkle",
    avatarText: "text-ink",
  },
  ember: {
    dot: "bg-ember",
    text: "text-ember-200",
    ring: "ring-ember/40",
    avatarBg: "bg-ember/20",
    avatarText: "text-ember-200",
  },
  amber: {
    dot: "bg-amber",
    text: "text-amber",
    ring: "ring-amber/40",
    avatarBg: "bg-amber",
    avatarText: "text-ink",
  },
  white: {
    dot: "bg-white",
    text: "text-white",
    ring: "ring-white/40",
    avatarBg: "bg-white",
    avatarText: "text-ink",
  },
};

export function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
