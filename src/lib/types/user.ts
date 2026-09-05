export interface User {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
  timezone: string;
  locale: string;
  clock12h: boolean;
  createdAt: string;
  updatedAt: string;
  onboardingCompletedAt: string | null;
}

export type AIAutonomy = "suggest" | "draft-daily" | "auto-protect" | "full-auto";

export interface SchedulerProfile {
  userId: string;
  timezone: string;
  workHours: Record<
    "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun",
    { start: string; end: string } | null
  >;
  focusWindows: { day: number; start: string; end: string }[];
  defaultBufferMin: number;
  minFocusBlockMin: number;
  maxDailyFocusMin: number;
  energyCurve: { hour: number; level: number }[];
  weights: {
    preferredWindow: number;
    focusAlignment: number;
    priority: number;
    fragmentation: number;
    deadlineUrgency: number;
  };
  durationBias: Record<string, number>;
  autonomy: AIAutonomy;
  dailyPlanAt: string;
  planningHorizonDays: number;
  updatedAt: string;
}

export interface NotificationPrefs {
  userId: string;
  channels: Record<
    | "event.reminder"
    | "plan.ready"
    | "plan.applied"
    | "conflict.detected"
    | "task.overdue"
    | "signal.new"
    | "account.error"
    | "focus.complete",
    { inApp: boolean; browser: boolean; email: boolean }
  >;
  defaultReminderMinutes: number;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  dailyPlanDeliveryTime: string;
}
