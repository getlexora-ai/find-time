import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { ProfileSettingsTab } from "@/components/settings/ProfileSettingsTab";

export default function SettingsProfilePage() {
  return (
    <SettingsLayout title="Profile" description="Your name, timezone, and account data.">
      <ProfileSettingsTab />
    </SettingsLayout>
  );
}
