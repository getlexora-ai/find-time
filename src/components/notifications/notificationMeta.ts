import type { NotificationType } from "@/lib/types";

export type NotificationTone = "lime" | "ember" | "periwinkle" | "amber";

interface NotificationTypeMeta {
  icon: string;
  tone: NotificationTone;
}

/**
 * Icon + tone per notification type. Shared between the full history page
 * and (in spirit) NotificationPopover's row idiom — alert-shaped types
 * (conflicts, overdue, account errors) render in ember, everything else in
 * a calmer accent.
 */
export const NOTIFICATION_META: Record<NotificationType, NotificationTypeMeta> = {
  "plan.ready": { icon: "solar:magic-stick-3-linear", tone: "lime" },
  "plan.applied": { icon: "solar:check-circle-linear", tone: "lime" },
  "signal.new": { icon: "solar:inbox-line-linear", tone: "periwinkle" },
  "conflict.detected": { icon: "solar:danger-triangle-linear", tone: "ember" },
  "task.overdue": { icon: "solar:clock-circle-linear", tone: "ember" },
  "account.error": { icon: "solar:letter-linear", tone: "ember" },
  "event.reminder": { icon: "solar:bell-linear", tone: "amber" },
  "focus.complete": { icon: "solar:bolt-linear", tone: "lime" },
};

export const TONE_TEXT_CLASSES: Record<NotificationTone, string> = {
  lime: "text-lime",
  ember: "text-ember",
  periwinkle: "text-periwinkle",
  amber: "text-amber",
};

export const TONE_WASH_CLASSES: Record<NotificationTone, string> = {
  lime: "bg-lime/10",
  ember: "bg-ember/10",
  periwinkle: "bg-periwinkle/10",
  amber: "bg-amber/10",
};

export type NotificationFilterKey = "all" | "plan" | "signals" | "conflicts" | "account";

export const NOTIFICATION_FILTERS: Array<{ key: NotificationFilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "plan", label: "Plan" },
  { key: "signals", label: "Signals" },
  { key: "conflicts", label: "Conflicts" },
  { key: "account", label: "Account" },
];

/** Type membership for every filter chip except "all" (which passes everything). */
export const NOTIFICATION_FILTER_TYPES: Record<Exclude<NotificationFilterKey, "all">, NotificationType[]> = {
  plan: ["plan.ready", "plan.applied"],
  signals: ["signal.new"],
  conflicts: ["conflict.detected", "task.overdue"],
  account: ["account.error"],
};
