"use client";

import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { NotificationPopover } from "@/components/layout/NotificationPopover";
import { ProfileMenuPopover } from "@/components/layout/ProfileMenuPopover";

const crumbLabels: Record<string, string> = {
  today: "Today",
  calendar: "Calendar",
  plan: "AI Sessions",
  tasks: "Tasks",
  projects: "Projects",
  signals: "Signals",
  notifications: "Notifications",
  settings: "Settings",
};

export function AppTopBar({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
  const pathname = usePathname();
  const segment = pathname.split("/")[2] ?? "today";

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/10 bg-blue/80 px-4 blur-bar sm:px-6">
      <p className="hidden font-mono text-xs text-white/40 sm:block">
        Workspace <span className="mx-1 text-white/20">/</span>{" "}
        <span className="text-white">{crumbLabels[segment] ?? segment}</span>
      </p>
      <div className="flex items-center gap-2 sm:hidden">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-lime text-ink">
          <span className="font-mono text-micro font-bold">FT</span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onOpenCommandPalette}
          className="hidden items-center gap-2 rounded-control border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-white/40 hover:bg-white/10 sm:flex"
        >
          <span>Search</span>
          <span className="rounded border border-white/15 px-1 text-micro">⌘K</span>
        </button>
        <div className="sm:hidden">
          <IconButton icon="solar:magnifer-linear" aria-label="Search" onClick={onOpenCommandPalette} />
        </div>
        <NotificationPopover />
        <Button size="sm" icon="solar:magic-stick-3-linear" className="hidden sm:inline-flex">
          Plan with AI
        </Button>
        <ProfileMenuPopover />
      </div>
    </header>
  );
}
