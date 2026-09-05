export type NotificationType =
  | "event.reminder"
  | "plan.ready"
  | "plan.applied"
  | "conflict.detected"
  | "task.overdue"
  | "signal.new"
  | "account.error"
  | "focus.complete";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  readAt: string | null;
  actionLabel: string | null;
  actionHref: string | null;
  createdAt: string;
}
