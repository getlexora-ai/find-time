import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { BillingSettingsTab } from "@/components/settings/BillingSettingsTab";

export default function SettingsBillingPage() {
  return (
    <SettingsLayout title="Billing" description="Plan, usage, and invoices.">
      <BillingSettingsTab />
    </SettingsLayout>
  );
}
