"use client";

import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils/cn";
import type { Notification } from "@/lib/types";
import { NOTIFICATION_META, TONE_TEXT_CLASSES, TONE_WASH_CLASSES } from "./notificationMeta";

export function NotificationRow({
  notification,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: () => void;
}) {
  const meta = NOTIFICATION_META[notification.type];
  const relative = formatDistanceToNowStrict(new Date(notification.createdAt), { addSuffix: true });

  const handleRowActivate = () => {
    if (!notification.read) onMarkRead();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleRowActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleRowActivate();
        }
      }}
      className={cn(
        "group flex items-start gap-3 rounded-control px-3 py-3 text-left transition-colors",
        "cursor-pointer hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/60",
        !notification.read && TONE_WASH_CLASSES[meta.tone],
      )}
    >
      <div
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]",
          TONE_TEXT_CLASSES[meta.tone],
        )}
      >
        <Icon name={meta.icon} size={16} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            {!notification.read && (
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONE_TEXT_CLASSES[meta.tone], "bg-current")} />
            )}
            <p className={cn("truncate font-mono text-sm", notification.read ? "text-white/70" : "text-white")}>
              {notification.title}
            </p>
          </div>
          <span className="shrink-0 font-mono text-micro text-white/40">{relative}</span>
        </div>

        <p className="font-mono text-xs text-white/50">{notification.body}</p>

        {notification.actionLabel && notification.actionHref && (
          <div className="mt-1">
            <Link
              href={notification.actionHref}
              onClick={(e) => {
                e.stopPropagation();
                if (!notification.read) onMarkRead();
              }}
              className="inline-flex items-center gap-1 rounded-control border border-lime/40 bg-lime/10 px-2.5 py-1 font-mono text-micro font-medium uppercase tracking-wider text-lime transition-colors hover:bg-lime/20"
            >
              {notification.actionLabel}
              <Icon name="solar:arrow-right-up-linear" size={11} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
