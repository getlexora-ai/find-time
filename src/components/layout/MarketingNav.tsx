import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";

const links = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/features/ai-scheduling", label: "AI scheduling" },
  { href: "/pricing", label: "Pricing" },
];

export function MarketingNav() {
  return (
    <nav className="flex items-center justify-between px-6 py-5 sm:px-10">
      <Link href="/" className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lime text-ink shadow-lime-glow">
          <Icon name="solar:clock-circle-linear" size={16} />
        </span>
        <span className="font-mono text-sm font-semibold uppercase tracking-wider text-white">
          Find Time
        </span>
      </Link>
      <div className="hidden items-center gap-8 md:flex">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="font-mono text-xs uppercase tracking-widest text-white/60 hover:text-white"
          >
            {l.label}
          </Link>
        ))}
      </div>
      <Button asChild size="sm">
        <Link href="/signup">Start planning</Link>
      </Button>
    </nav>
  );
}
