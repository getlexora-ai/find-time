"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { Icon } from "@/components/ui/Icon";
import { useSettingsProfile } from "@/lib/hooks/useSettings";
import { useLogout } from "@/lib/hooks/useSession";

export function ProfileMenuPopover() {
  const { data: user } = useSettingsProfile();
  const logout = useLogout();
  const router = useRouter();

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="flex items-center gap-2 rounded-control px-2 py-1.5 hover:bg-white/5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-periwinkle font-mono text-micro font-semibold text-ink">
            {user?.name?.slice(0, 2).toUpperCase() ?? "??"}
          </span>
          <Icon name="solar:menu-dots-linear" size={14} className="hidden text-white/40 lg:block" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-56 rounded-xl border border-white/10 bg-ink p-1.5 shadow-panel"
        >
          <div className="border-b border-white/10 px-3 py-2">
            <p className="font-mono text-sm text-white">{user?.name}</p>
            <p className="font-mono text-micro text-white/40">{user?.email}</p>
          </div>
          <button
            onClick={() => router.push("/app/settings/profile")}
            className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-left font-mono text-xs text-white/70 hover:bg-white/5"
          >
            <Icon name="solar:user-circle-linear" size={15} />
            Settings
          </button>
          <button
            onClick={async () => {
              await logout.mutateAsync();
              router.push("/login");
            }}
            className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-left font-mono text-xs text-white/70 hover:bg-white/5"
          >
            <Icon name="solar:close-circle-linear" size={15} />
            Sign out
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
