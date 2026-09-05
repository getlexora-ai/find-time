export const queryKeys = {
  events: ["events"] as const,
  event: (id: string) => ["events", id] as const,
  tasks: ["tasks"] as const,
  task: (id: string) => ["tasks", id] as const,
  projects: ["projects"] as const,
  signals: ["signals"] as const,
  notifications: ["notifications"] as const,
  connections: ["connections"] as const,
  settingsProfile: ["settings", "profile"] as const,
  settingsAI: ["settings", "ai"] as const,
  settingsSchedule: ["settings", "schedule"] as const,
  settingsNotifications: ["settings", "notifications"] as const,
};
