import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { AccountsSettingsTab } from "@/components/settings/AccountsSettingsTab";

export default function SettingsAccountsPage() {
  return (
    <SettingsLayout title="Accounts" description="Connected Gmail, IMAP, and task-source accounts.">
      <AccountsSettingsTab />
    </SettingsLayout>
  );
}
