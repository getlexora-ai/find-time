import { isToday, isYesterday } from "date-fns";
import type { Notification } from "@/lib/types";

export interface NotificationDayGroup {
  label: string;
  items: Notification[];
}

/**
 * Buckets an already-sorted-or-not list of notifications into Today /
 * Yesterday / Earlier sections (newest first within each), by createdAt.
 */
export function groupNotificationsByDay(notifications: Notification[]): NotificationDayGroup[] {
  const sorted = [...notifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const today: Notification[] = [];
  const yesterday: Notification[] = [];
  const earlier: Notification[] = [];

  for (const n of sorted) {
    const date = new Date(n.createdAt);
    if (isToday(date)) today.push(n);
    else if (isYesterday(date)) yesterday.push(n);
    else earlier.push(n);
  }

  const groups: NotificationDayGroup[] = [];
  if (today.length) groups.push({ label: "Today", items: today });
  if (yesterday.length) groups.push({ label: "Yesterday", items: yesterday });
  if (earlier.length) groups.push({ label: "Earlier", items: earlier });
  return groups;
}
