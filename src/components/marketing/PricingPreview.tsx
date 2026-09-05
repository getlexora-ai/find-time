import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";

const tiers = [
  { name: "Solo", price: "$12", features: ["2 connected accounts", "AI daily plan", "Calendar sync"] },
  {
    name: "Pro",
    price: "$24",
    highlight: true,
    features: ["5 connected accounts", "Full autonomy modes", "Signals + task import", "Priority support"],
  },
  { name: "Team", price: "$19", sub: "/seat", features: ["Unlimited accounts", "Shared projects", "Admin controls"] },
];

export function PricingPreview() {
  return (
    <div className="px-6 py-20 sm:px-10">
      <p className="mb-8 text-center font-mono text-xs uppercase tracking-eyebrow text-lime">Pricing</p>
      <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-3">
        {tiers.map((t) => (
          <div
            key={t.name}
            className={`flex flex-col gap-4 rounded-card border p-6 ${
              t.highlight ? "border-lime bg-lime/[0.06]" : "border-white/10 bg-white/[0.04]"
            }`}
          >
            {t.highlight && <Chip tone="lime" className="w-fit">Most popular</Chip>}
            <p className="font-mono text-sm uppercase tracking-widest text-white/60">{t.name}</p>
            <p className="font-mono text-3xl font-medium text-white">
              {t.price}
              <span className="text-sm text-white/40">{t.sub ?? "/mo"}</span>
            </p>
            <ul className="flex flex-col gap-2">
              {t.features.map((f) => (
                <li key={f} className="flex items-center gap-2 font-mono text-xs text-white/65">
                  <Icon name="solar:check-circle-linear" size={14} className="text-lime" />
                  {f}
                </li>
              ))}
            </ul>
            <Button variant={t.highlight ? "primary" : "ghost"} asChild className="mt-2">
              <Link href="/pricing">Choose {t.name}</Link>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
