import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/brand/Wordmark";

const links = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/features/ai-scheduling", label: "AI scheduling" },
  { href: "/pricing", label: "Pricing" },
];

export function MarketingNav() {
  return (
    <nav className="flex items-center justify-between px-6 py-5 sm:px-10">
      <Link href="/" className="flex items-center" aria-label="Find Time — home">
        <Wordmark className="h-7 w-auto text-white" />
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
