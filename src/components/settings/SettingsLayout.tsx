"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/ui/Icon";

const TABS = [
  { href: "/app/settings/accounts", label: "Accounts", icon: "solar:letter-linear" },
  { href: "/app/settings/calendars", label: "Calendars", icon: "solar:calendar-minimalistic-linear" },
  { href: "/app/settings/ai", label: "AI", icon: "solar:magic-stick-3-linear" },
  { href: "/app/settings/schedule", label: "Schedule", icon: "solar:clock-circle-linear" },
  { href: "/app/settings/notifications", label: "Notifications", icon: "solar:bell-linear" },
  { href: "/app/settings/profile", label: "Profile", icon: "solar:user-circle-linear" },
  { href: "/app/settings/appearance", label: "Appearance", icon: "solar:pallete-2-linear" },
  { href: "/app/settings/billing", label: "Billing", icon: "solar:card-linear" },
];

export function SettingsLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row lg:gap-10">
      <div className="shrink-0 lg:w-52">
        <p className="mb-3 px-1 font-mono text-xs uppercase tracking-widest text-white/40">Settings</p>
        <nav className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-control px-3 py-2 font-mono text-xs transition-colors",
                  active
                    ? "bg-white/10 text-white ring-1 ring-white/10"
                    : "text-white/55 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon name={tab.icon} size={15} />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-6">
          <h1 className="font-mono text-xl font-medium text-white">{title}</h1>
          {description && <p className="mt-1 font-mono text-xs text-white/45">{description}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
