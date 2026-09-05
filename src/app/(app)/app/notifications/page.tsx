"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { emptyStates } from "@/content/voice";
import { useNotifications, useMarkNotificationRead } from "@/lib/hooks/useNotifications";
import { NotificationRow } from "@/components/notifications/NotificationRow";
import { NotificationFilterChips } from "@/components/notifications/NotificationFilterChips";
import { NOTIFICATION_FILTER_TYPES, type NotificationFilterKey } from "@/components/notifications/notificationMeta";
import { groupNotificationsByDay } from "@/components/notifications/groupByDay";

export default function NotificationsPage() {
  const { data: notifications, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const [filter, setFilter] = useState<NotificationFilterKey>("all");

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;

  const filtered = useMemo(() => {
    if (!notifications) return [];
    if (filter === "all") return notifications;
    const types = NOTIFICATION_FILTER_TYPES[filter];
    return notifications.filter((n) => types.includes(n.type));
  }, [notifications, filter]);

  const groups = useMemo(() => groupNotificationsByDay(filtered), [filtered]);

  const handleMarkAllRead = () => {
    notifications?.filter((n) => !n.read).forEach((n) => markRead.mutate(n.id));
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 md:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-lime">Notifications</p>
          <h1 className="mt-1 font-mono text-2xl font-medium text-white">
            {unreadCount > 0
              ? `${String(unreadCount).padStart(2, "0")} unread`
              : "All caught up"}
          </h1>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon="solar:check-read-linear"
          onClick={handleMarkAllRead}
          disabled={unreadCount === 0 || markRead.isPending}
        >
          Mark all read
        </Button>
      </header>

      <NotificationFilterChips value={filter} onChange={setFilter} />

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-16 w-full rounded-card" />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="py-4">
          <EmptyState {...emptyStates.notifications} />
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.label} className="flex flex-col gap-2">
              <p className="font-mono text-xs uppercase tracking-widest text-white/40">
                {group.label}
              </p>
              <Card tone="glass" className="flex flex-col gap-1 p-2">
                {group.items.map((n) => (
                  <NotificationRow
                    key={n.id}
                    notification={n}
                    onMarkRead={() => markRead.mutate(n.id)}
                  />
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
