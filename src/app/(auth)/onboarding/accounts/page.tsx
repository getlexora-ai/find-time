import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { AccountsManager } from "@/components/accounts/AccountsManager";

export default function OnboardingAccountsPage() {
  return (
    <OnboardingLayout
      step="accounts"
      title="Bring in the context."
      subtitle="Find Time reads your mail to learn what you have committed to. It never sends anything."
      wide
    >
      <AccountsManager />
    </OnboardingLayout>
  );
}
