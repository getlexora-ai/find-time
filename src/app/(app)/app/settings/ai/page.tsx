import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { AISettingsTab } from "@/components/settings/AISettingsTab";

export default function SettingsAIPage() {
  return (
    <SettingsLayout title="AI preferences" description="How autonomous Find Time is, and how it should feel to work with.">
      <AISettingsTab />
    </SettingsLayout>
  );
}
