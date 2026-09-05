"use client";

import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { IconButton } from "@/components/ui/IconButton";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { useNotifications, useMarkNotificationRead } from "@/lib/hooks/useNotifications";
import { emptyStates } from "@/content/voice";

export function NotificationPopover() {
  const { data: notifications } = useNotifications();
  const markRead = useMarkNotificationRead();
  const unread = notifications?.filter((n) => !n.read).length ?? 0;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <div className="relative">
          <IconButton icon="solar:bell-linear" aria-label="Notifications" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-ember" />
          )}
        </div>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-80 rounded-xl border border-white/10 bg-ink p-2 shadow-panel"
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="font-mono text-xs uppercase tracking-widest text-white/50">Notifications</p>
            <Link href="/app/notifications" className="font-mono text-micro text-lime">
              View all
            </Link>
          </div>
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {!notifications?.length && (
              <div className="px-2 py-3">
                <EmptyState {...emptyStates.notifications} />
              </div>
            )}
            {notifications?.slice(0, 6).map((n) => (
              <button
                key={n.id}
                onClick={() => !n.read && markRead.mutate(n.id)}
                className={`flex flex-col gap-0.5 rounded-control px-3 py-2 text-left ${
                  n.read ? "" : "bg-white/[0.07]"
                } hover:bg-white/10`}
              >
                <div className="flex items-center gap-1.5">
                  {!n.read && <Icon name="solar:danger-triangle-linear" size={12} className="text-ember" />}
                  <p className="font-mono text-xs text-white">{n.title}</p>
                </div>
                <p className="font-mono text-micro text-white/45">{n.body}</p>
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
