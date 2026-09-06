import { ink, w } from '@/design/tokens';

/**
 * The landing's measured text ramp.
 *
 * `calendar-design-spec.md` §6 measures its pairs against `#121212`. The landing
 * puts most of its text on **blue** (`#2047e6`) and on the feature-card fill
 * (`#1739bc`/95), where the mockup's alphas are materially darker than they look on
 * the calendar's near-black. Every value below was re-measured (sRGB relative
 * luminance, WCAG 2.1) and raised where landing.html fell under 4.5:1.
 *
 * Each deviation is logged in HANDOFF-landing.md. Keeping them here — rather than
 * inline in fifteen StyleSheets — is what makes that log auditable.
 *
 *   ground                     white/55  white/65  white/45  white/35
 *   blue #2047e6                  3.09      3.74      2.53      2.06
 *   feature card #1739bc/95       3.73      4.61      2.97      2.34
 *   planner card #121212/90       6.07      8.00      4.48      3.22
 */
export const RAMP = {
  /** Body copy on the blue ground. landing.html `text-white/65` → 3.74:1. */
  onBlue: w(0.78), //          4.72:1
  /** Nav links, secondary CTA label. landing.html `text-white/60` → 3.41:1. */
  onBlueMuted: w(0.78), //     4.72:1
  /** The ambient telemetry rail. landing.html `text-white/35` → 2.06:1. */
  onBlueFaint: w(0.78), //     4.72:1

  /** Feature-card body. landing.html `text-white/55` → 3.73:1. */
  onFeature: w(0.65), //       4.61:1

  /** Every muted label inside the dark planner card. landing.html uses
   *  `/30` (gutter), `/35` (recovery), `/40` (chrome), `/45` (row meta). */
  onPanel: w(0.5), //          5.23:1

  /** Muted labels on the light phone card. landing.html `text-[#121212]/45`
   *  → 2.97:1, and `/55` on the status bar → 4.03:1. */
  onLight: ink(0.6), //        4.75:1

  /** Body of the AI response block (#c8c8ff). landing.html `/75` already passes. */
  onAiResponse: ink(0.75), //  6.44:1

  /** Sub-label on the lime weekly-goal widget. landing.html `/55` → 3.99:1. */
  onLime: ink(0.6), //         4.68:1

  /** The focus-timer countdown on #121212. landing.html `text-white/35` → 3.54:1. */
  onBlack: w(0.55), //         6.30:1
} as const;
