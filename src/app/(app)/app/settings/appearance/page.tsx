import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { AppearanceSettingsTab } from "@/components/settings/AppearanceSettingsTab";

export default function SettingsAppearancePage() {
  return (
    <SettingsLayout title="Appearance" description="Density, motion, and decorative chrome — stored on this device only.">
      <AppearanceSettingsTab />
    </SettingsLayout>
  );
}
