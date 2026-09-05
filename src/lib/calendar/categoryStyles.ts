import type { EventCategory } from "@/lib/types/event";

/**
 * Category -> skin mapping, transcribed from PLAN.md §2.2 "on-blue block"
 * column (the calendar grid lives directly on the app's blue field, not a
 * paper panel). Only visual skin lives here — grid math in `time.ts`/
 * `layout.ts` is untouched by any of this.
 */
export interface CategoryStyle {
  /** fill + border classes for the block body */
  block: string;
  /** small icon-tile swatch shown at the head of the block */
  tile: string;
  /** icon color when no dedicated tile bg is used */
  icon: string;
  iconName: string;
  label: string;
}

export const CATEGORY_STYLES: Record<EventCategory, CategoryStyle> = {
  "deep-work": {
    block: "bg-lime/10 border border-lime/20",
    tile: "bg-lime text-ink",
    icon: "text-lime",
    iconName: "solar:bolt-linear",
    label: "Deep work",
  },
  design: {
    block: "bg-white/[0.06] border border-white/10",
    tile: "bg-periwinkle text-ink",
    icon: "text-periwinkle",
    iconName: "solar:pallete-2-linear",
    label: "Design",
  },
  research: {
    block: "bg-white/[0.06] border border-white/10",
    tile: "bg-ember-200 text-ink",
    icon: "text-ember-200",
    iconName: "solar:notebook-linear",
    label: "Research",
  },
  meeting: {
    block: "bg-white/[0.06] border border-white/10",
    tile: "bg-periwinkle text-ink",
    icon: "text-white",
    iconName: "solar:users-group-rounded-linear",
    label: "Meeting",
  },
  admin: {
    block: "bg-amber/10 border border-amber/25",
    tile: "bg-amber text-ink",
    icon: "text-amber",
    iconName: "solar:inbox-line-linear",
    label: "Admin",
  },
  learning: {
    block: "bg-lime/10 border border-lime/20",
    tile: "bg-lime text-ink",
    icon: "text-lime",
    iconName: "solar:book-2-linear",
    label: "Learning",
  },
  break: {
    block: "bg-white/[0.03] border border-dashed border-white/20",
    tile: "bg-transparent text-white/50",
    icon: "text-white/50",
    iconName: "solar:cup-hot-linear",
    label: "Break",
  },
  other: {
    block: "bg-white/[0.06] border border-white/10",
    tile: "bg-white/20 text-white",
    icon: "text-white/60",
    iconName: "solar:calendar-minimalistic-linear",
    label: "Other",
  },
};
