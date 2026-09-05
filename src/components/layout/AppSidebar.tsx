"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/ui/Icon";
import { Badge, Dot } from "@/components/ui/Badge";
import { ProgressMeter } from "@/components/ui/ProgressMeter";
import { useTasks } from "@/lib/hooks/useTasks";
import { useProjects } from "@/lib/hooks/useProjects";
import { useSignals } from "@/lib/hooks/useSignals";

const navItems = [
  { href: "/app/today", label: "Today", icon: "solar:sun-2-linear" },
  { href: "/app/calendar", label: "Calendar", icon: "solar:calendar-minimalistic-linear" },
  { href: "/app/plan", label: "AI Sessions", icon: "solar:magic-stick-3-linear" },
  { href: "/app/tasks", label: "Tasks", icon: "solar:checklist-minimalistic-linear" },
  { href: "/app/signals", label: "Signals", icon: "solar:inbox-line-linear" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { data: tasks } = useTasks();
  const { data: projects } = useProjects();
  const { data: signals } = useSignals();

  const unscheduledCount = tasks?.filter((t) => t.status === "backlog").length ?? 0;
  const pendingSignals = signals?.filter((s) => s.status === "new").length ?? 0;

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-blue-750/30 blur-surface lg:flex">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lime text-ink shadow-lime-glow">
          <Icon name="solar:clock-circle-linear" size={16} />
        </span>
        <div>
          <p className="font-mono text-sm font-semibold uppercase tracking-wider text-white">Find Time</p>
          <p className="font-mono text-micro text-white/35">AI calendar planning</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          const badge =
            item.href === "/app/tasks" && unscheduledCount > 0 ? (
              <Badge count={unscheduledCount} />
            ) : item.href === "/app/signals" && pendingSignals > 0 ? (
              <Badge count={pendingSignals} />
            ) : item.href === "/app/plan" && pendingSignals > 0 ? (
              <Dot tone="ember" />
            ) : null;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between rounded-control px-3 py-2 font-mono text-xs transition-colors",
                active ? "bg-white/10 text-white ring-1 ring-white/10" : "text-white/60 hover:bg-white/5 hover:text-white",
              )}
            >
              <span className="flex items-center gap-2.5">
                <Icon name={item.icon} size={16} />
                {item.label}
              </span>
              {badge}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 px-3">
        <div className="flex items-center justify-between px-3 py-2">
          <p className="font-mono text-micro uppercase tracking-widest text-white/40">Projects</p>
          <Link href="/app/projects" className="text-white/40 hover:text-white">
            <Icon name="solar:add-circle-linear" size={14} />
          </Link>
        </div>
        <div className="flex flex-col gap-0.5">
          {projects?.map((p) => (
            <Link
              key={p.id}
              href={`/app/projects/${p.id}`}
              className="flex items-center gap-2.5 rounded-control px-3 py-1.5 font-mono text-xs text-white/60 hover:bg-white/5 hover:text-white"
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: `var(--color-${p.color}, #CCFF00)` }}
              />
              <span className="truncate">{p.name}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-auto p-3">
        <div className="rounded-xl border border-white/10 bg-ink p-4">
          <p className="font-mono text-xs uppercase tracking-widest text-white/50">Weekly focus</p>
          <p className="mt-1 font-mono text-lg text-white">
            68<span className="text-xs text-lime">% +12%</span>
          </p>
          <ProgressMeter value={68} className="mt-2" />
          <p className="mt-2 font-mono text-micro text-white/35">
            11h 20m of protected work completed.
          </p>
        </div>
      </div>
    </aside>
  );
}
