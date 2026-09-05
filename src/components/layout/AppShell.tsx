"use client";

import * as React from "react";
import { BracketFrame } from "@/components/motif/BracketFrame";
import { MarqueeTicker } from "@/components/motif/MarqueeTicker";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { marqueePhrases } from "@/content/voice";
import { useTasks } from "@/lib/hooks/useTasks";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const { data: tasks } = useTasks();
  const protectedToday = tasks?.filter((t) => t.status === "scheduled").length ?? 0;

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <BracketFrame variant="app" />
      <MarqueeTicker items={marqueePhrases.app({ tasksProtected: protectedToday })} tone="lime" />
      <div className="flex flex-1">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopBar onOpenCommandPalette={() => setPaletteOpen(true)} />
          <main className="flex-1 pb-24 lg:pb-0">{children}</main>
        </div>
      </div>
      <MobileTabBar />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
