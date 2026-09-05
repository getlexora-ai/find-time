import Link from "next/link";
import { StatusDot } from "@/components/ui/StatusDot";
import { Button } from "@/components/ui/Button";
import { heroCopy } from "@/content/voice";

export function HeroSection() {
  return (
    <div className="px-6 pb-16 pt-10 text-center sm:px-10">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6">
        <div className="flex items-center gap-2">
          <StatusDot tone="live" pulse />
          <span className="font-mono text-xs uppercase tracking-eyebrow text-white/55">
            {heroCopy.eyebrow} · Friday
          </span>
        </div>
        <h1 className="font-mono text-4xl font-medium leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
          {heroCopy.headlineLine1}
          <br />
          <span className="text-lime">{heroCopy.headlineLine2}</span>
        </h1>
        <p className="max-w-md font-mono text-sm text-white/60">{heroCopy.subcopy}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button variant="inverse" size="lg" icon="solar:magic-stick-3-linear" asChild>
            <Link href="/signup">Plan my day</Link>
          </Button>
          <Button variant="ghost" size="lg" icon="solar:play-circle-linear" asChild>
            <Link href="/demo">See 40 sec demo</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
