import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";

export function BillingSettingsTab() {
  return (
    <div className="flex flex-col gap-6">
      <Card tone="glass" className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-white/50">Current plan</p>
          <p className="mt-1 font-mono text-lg text-white">Pro trial</p>
        </div>
        <Chip tone="lime">14 days left</Chip>
      </Card>
      <EmptyState
        icon="solar:card-linear"
        eyebrow="Billing coming soon"
        message="Invoices and plan management will appear here once billing is enabled."
      />
    </div>
  );
}
