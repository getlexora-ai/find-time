"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@/components/ui/Icon";

const destinations = [
  { label: "Today", href: "/app/today", icon: "solar:sun-2-linear" },
  { label: "Calendar", href: "/app/calendar", icon: "solar:calendar-minimalistic-linear" },
  { label: "AI Sessions", href: "/app/plan", icon: "solar:magic-stick-3-linear" },
  { label: "Tasks", href: "/app/tasks", icon: "solar:checklist-minimalistic-linear" },
  { label: "Projects", href: "/app/projects", icon: "solar:folder-with-files-linear" },
  { label: "Signals", href: "/app/signals", icon: "solar:inbox-line-linear" },
  { label: "Settings", href: "/app/settings/accounts", icon: "solar:user-circle-linear" },
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");

  const filtered = destinations.filter((d) => d.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-blue-950/70 blur-scrim" />
        <Dialog.Content className="fixed left-1/2 top-24 z-[70] w-[90vw] max-w-md -translate-x-1/2 overflow-hidden rounded-card border border-white/10 bg-ink shadow-panel">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <Icon name="solar:magnifer-linear" className="text-white/40" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks, events, settings…"
              className="w-full bg-transparent font-mono text-sm text-white placeholder:text-white/30 focus:outline-none"
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-1.5">
            {filtered.map((d) => (
              <button
                key={d.href}
                onClick={() => {
                  router.push(d.href);
                  onOpenChange(false);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left font-mono text-xs text-white/70 hover:bg-white/10"
              >
                <Icon name={d.icon} size={15} />
                {d.label}
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
