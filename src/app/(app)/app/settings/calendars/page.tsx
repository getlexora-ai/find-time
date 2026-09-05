import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { CalendarsSettingsTab } from "@/components/settings/CalendarsSettingsTab";

export default function SettingsCalendarsPage() {
  return (
    <SettingsLayout title="Calendars" description="Choose which calendars sync and where Find Time writes new events.">
      <CalendarsSettingsTab />
    </SettingsLayout>
  );
}
