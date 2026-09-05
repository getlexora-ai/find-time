import { BracketFrame } from "@/components/motif/BracketFrame";
import { MarqueeTicker } from "@/components/motif/MarqueeTicker";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { marqueePhrases } from "@/content/voice";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BracketFrame variant="marketing" crosshair />
      <MarqueeTicker items={marqueePhrases.marketing} />
      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />
    </>
  );
}
