"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/ui/Icon";

const tabs = [
  { href: "/app/today", label: "Today", icon: "solar:sun-2-linear" },
  { href: "/app/projects", label: "Projects", icon: "solar:folder-with-files-linear" },
];
const tabsRight = [
  { href: "/app/calendar", label: "Calendar", icon: "solar:calendar-minimalistic-linear" },
  { href: "/app/settings/profile", label: "Profile", icon: "solar:user-circle-linear" },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between border-t border-white/10 bg-blue/90 px-6 blur-bar lg:hidden"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))", paddingTop: "0.75rem" }}
    >
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "flex flex-col items-center gap-1 font-mono text-micro",
            isActive(t.href) ? "text-lime" : "text-white/45",
          )}
        >
          <Icon name={t.icon} size={18} />
          {t.label}
        </Link>
      ))}

      <Link
        href="/app/plan"
        className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-lime text-ink shadow-lime-glow"
      >
        <Icon name="solar:magic-stick-3-linear" size={22} />
      </Link>

      {tabsRight.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "flex flex-col items-center gap-1 font-mono text-micro",
            isActive(t.href) ? "text-lime" : "text-white/45",
          )}
        >
          <Icon name={t.icon} size={18} />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
