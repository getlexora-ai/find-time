import Link from "next/link";
import { TelemetryRow } from "@/components/motif/AxisMarkers";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/features/ai-scheduling", label: "AI Scheduling" },
      { href: "/features/inbox-context", label: "Inbox Context" },
      { href: "/features/tasks", label: "Tasks" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/security", label: "Security" },
      { href: "/changelog", label: "Changelog" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/privacy", label: "Privacy" },
      { href: "/legal/terms", label: "Terms" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/10 px-6 py-14 sm:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 md:flex-row md:justify-between">
        <div>
          <p className="font-mono text-sm font-semibold uppercase tracking-wider text-white">Find Time</p>
          <p className="mt-2 max-w-xs font-mono text-xs text-white/45">
            AI that plans your calendar in advance, from your inbox and your to-dos.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-8">
          {columns.map((col) => (
            <div key={col.title}>
              <p className="mb-3 font-mono text-micro uppercase tracking-widest text-white/40">{col.title}</p>
              <ul className="flex flex-col gap-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="font-mono text-xs text-white/60 hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-10 max-w-5xl border-t border-white/10 pt-6">
        <TelemetryRow items={["© 2026 Find Time", "TLS 1.3", "SOC2 in progress"]} />
      </div>
    </footer>
  );
}
