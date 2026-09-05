import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { Icon } from "@/components/ui/Icon";

export default function OnboardingWelcomePage() {
  return (
    <OnboardingLayout
      step="welcome"
      title="Welcome to Find Time."
      subtitle="In the next few minutes we'll connect your accounts, learn your working hours, and build your first plan."
      continueLabel="Get started"
    >
      <div className="flex flex-col gap-3">
        {[
          { icon: "solar:letter-linear", text: "Connect your Gmail accounts and to-do lists" },
          { icon: "solar:clock-circle-linear", text: "Tell us your working hours and focus preferences" },
          { icon: "solar:magic-stick-3-linear", text: "See your first AI-built plan" },
        ].map((item) => (
          <div key={item.text} className="flex items-center gap-3 rounded-control border border-white/10 bg-white/5 px-4 py-3">
            <Icon name={item.icon} className="text-lime" />
            <span className="font-mono text-sm text-white/75">{item.text}</span>
          </div>
        ))}
      </div>
    </OnboardingLayout>
  );
}
