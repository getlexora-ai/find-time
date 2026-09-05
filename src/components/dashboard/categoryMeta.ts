import type { EventCategory } from "@/lib/types";

/**
 * Event-category palette — PLAN.md §2.2. Rendered on paper (light) surfaces,
 * so these are the "on-paper chip" colors from the spec table, not the
 * on-blue block treatment (that belongs to the calendar grid, built elsewhere).
 */
export interface CategoryMeta {
  label: string;
  icon: string;
  /** Classes for the small rounded chip shown on a schedule row. */
  chipClass: string;
  /** Classes for a small solid dot used in meta rows / date tiles. */
  dotClass: string;
}

export const categoryMeta: Record<EventCategory, CategoryMeta> = {
  "deep-work": {
    label: "Deep work",
    icon: "solar:bolt-linear",
    chipClass: "bg-lime/70 text-ink",
    dotClass: "bg-lime",
  },
  design: {
    label: "Design",
    icon: "solar:pallete-2-linear",
    chipClass: "bg-periwinkle text-ink",
    dotClass: "bg-periwinkle",
  },
  research: {
    label: "Research",
    icon: "solar:notebook-linear",
    chipClass: "bg-ember-200 text-ink",
    dotClass: "bg-ember-200",
  },
  meeting: {
    label: "Meeting",
    icon: "solar:users-group-rounded-linear",
    chipClass: "bg-white text-ink border border-ink/15",
    dotClass: "bg-ink/30",
  },
  admin: {
    label: "Admin batch",
    icon: "solar:inbox-line-linear",
    chipClass: "bg-amber text-ink",
    dotClass: "bg-amber",
  },
  learning: {
    label: "Learning",
    icon: "solar:book-2-linear",
    chipClass: "bg-lime text-ink",
    dotClass: "bg-lime",
  },
  break: {
    label: "Break",
    icon: "solar:cup-hot-linear",
    chipClass: "border border-dashed border-ink/15 bg-paper-sunk text-ink/60",
    dotClass: "bg-ink/20",
  },
  other: {
    label: "Other",
    icon: "solar:calendar-minimalistic-linear",
    chipClass: "bg-white text-ink border border-ink/15",
    dotClass: "bg-ink/30",
  },
};

/** Known project accent-color tokens → literal Tailwind classes (must stay literal for the JIT scanner). */
export const projectDotClass: Record<string, string> = {
  lime: "bg-lime",
  periwinkle: "bg-periwinkle",
  amber: "bg-amber",
  ember: "bg-ember",
  paper: "bg-white",
};
