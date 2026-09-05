import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { NotificationsSettingsTab } from "@/components/settings/NotificationsSettingsTab";

export default function SettingsNotificationsPage() {
  return (
    <SettingsLayout title="Notifications" description="Choose which channel each type of alert reaches you on.">
      <NotificationsSettingsTab />
    </SettingsLayout>
  );
}
