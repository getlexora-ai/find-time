"use client";

import { useSettingsNotifications, useUpdateNotificationSettings } from "@/lib/hooks/useSettings";
import { Switch, Field, Input } from "@/components/ui/Field";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import type { NotificationPrefs } from "@/lib/types";

type ChannelType = keyof NotificationPrefs["channels"];

const ROWS: { type: ChannelType; label: string }[] = [
  { type: "plan.ready", label: "Daily plan ready" },
  { type: "plan.applied", label: "Plan applied" },
  { type: "conflict.detected", label: "Conflict detected" },
  { type: "task.overdue", label: "Task overdue" },
  { type: "signal.new", label: "New inbox signal" },
  { type: "account.error", label: "Account needs attention" },
  { type: "event.reminder", label: "Event reminders" },
  { type: "focus.complete", label: "Focus session complete" },
];

const CHANNELS: { key: "inApp" | "browser" | "email"; label: string }[] = [
  { key: "inApp", label: "In-app" },
  { key: "browser", label: "Browser" },
  { key: "email", label: "Email" },
];

export function NotificationsSettingsTab() {
  const { data: prefs, isLoading } = useSettingsNotifications();
  const update = useUpdateNotificationSettings();

  if (isLoading || !prefs) {
    return (
      <div className="flex flex-col gap-3">
        <SkeletonBlock className="h-64 w-full" />
      </div>
    );
  }

  function toggle(type: ChannelType, channel: "inApp" | "browser" | "email", value: boolean) {
    if (!prefs) return;
    update.mutate({
      channels: { ...prefs.channels, [type]: { ...prefs.channels[type], [channel]: value } },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-x-auto rounded-card border border-white/10">
        <table className="w-full border-collapse font-mono text-xs">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="px-4 py-2.5 text-left text-white/50">Notification</th>
              {CHANNELS.map((c) => (
                <th key={c.key} className="px-4 py-2.5 text-center text-white/50">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.type} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-2.5 text-white/80">{row.label}</td>
                {CHANNELS.map((c) => (
                  <td key={c.key} className="px-4 py-2.5 text-center">
                    <Switch
                      checked={prefs.channels[row.type][c.key]}
                      onCheckedChange={(v) => toggle(row.type, c.key, v)}
                      className="mx-auto"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Quiet hours start" description="Also suppresses AI auto-actions">
          <Input
            type="time"
            value={prefs.quietHoursStart ?? ""}
            onChange={(e) => update.mutate({ quietHoursStart: e.target.value })}
          />
        </Field>
        <Field label="Quiet hours end">
          <Input
            type="time"
            value={prefs.quietHoursEnd ?? ""}
            onChange={(e) => update.mutate({ quietHoursEnd: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}
