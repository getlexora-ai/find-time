import { HeroSection } from "@/components/marketing/HeroSection";
import { PlannerPreviewCard } from "@/components/marketing/PlannerPreviewCard";
import { AskPanelPhone } from "@/components/marketing/AskPanelPhone";
import { HowItWorksStrip } from "@/components/marketing/HowItWorksStrip";
import { FeatureTriptych } from "@/components/marketing/FeatureTriptych";
import { MultiAccountBand } from "@/components/marketing/MultiAccountBand";
import { PricingPreview } from "@/components/marketing/PricingPreview";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { HUDGauge } from "@/components/ui/HUDGauge";
import { DraggableWidgetChip } from "@/components/ui/DraggableWidgetChip";
import { FocusTimerPill } from "@/components/ui/FocusTimerPill";
import { AxisMarkers } from "@/components/motif/AxisMarkers";
import { Icon } from "@/components/ui/Icon";

export default function LandingPage() {
  return (
    <div className="relative">
      <HeroSection />

      <div className="relative mx-auto max-w-5xl px-6 pb-6 sm:px-10">
        <div className="hidden xl:block">
          <AxisMarkers
            className="absolute -left-4 top-6"
            items={["DAY.247", "WK.36", "CAP.08H", "FOC.04", "ENERGY.78"]}
          />
        </div>

        <div className="relative grid gap-8 lg:grid-cols-[1fr_18rem] lg:items-start">
          <PlannerPreviewCard />
          <AskPanelPhone className="mx-auto lg:mx-0" />
        </div>

        <div className="relative mt-10 hidden h-20 sm:block">
          <DraggableWidgetChip
            tone="lime"
            initial={{ x: 40, y: 10 }}
            float="slow"
            storageKey="ft-widget-weekly-goal"
          >
            <div className="flex items-center gap-2 font-mono text-xs">
              <Icon name="solar:chart-2-linear" />
              <span>Weekly goal · 3.5h</span>
            </div>
          </DraggableWidgetChip>
          <DraggableWidgetChip
            tone="ember"
            initial={{ x: 300, y: 40 }}
            float="fast"
            storageKey="ft-widget-comment"
          >
            <div className="flex items-center gap-2 font-mono text-xs">
              <Icon name="solar:chat-round-dots-linear" />
              <span>&ldquo;Can we push this to Friday?&rdquo;</span>
            </div>
          </DraggableWidgetChip>
          <div className="absolute right-0 top-2">
            <FocusTimerPill />
          </div>
        </div>
      </div>

      <HowItWorksStrip />
      <FeatureTriptych />
      <MultiAccountBand />

      <div className="flex justify-center px-6 py-10 sm:px-10">
        <HUDGauge value={95} label="Plan accuracy" />
      </div>

      <PricingPreview />
      <FinalCTA />
    </div>
  );
}
