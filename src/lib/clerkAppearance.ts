import { C, R } from '@/design/tokens';

/**
 * Makes Clerk's web UI — `<SignIn/>` / `<SignUp/>`, `<UserButton/>` and the
 * `<UserProfile/>` overlay — read as part of Find Time: all-monospace type, the
 * `#121212` surface, lime accent, hairline `rgba(255,255,255,0.1)` borders.
 *
 * Passed once to `<ClerkProvider appearance={…}>` in `app/_layout.tsx`. `elements`
 * (web CSS) is ignored on native; the colour + font `variables` are all that
 * carry there, and native has no Clerk UI to speak of anyway.
 */

// The `web` branch of design/ui.tsx `MONO` — inlined so this stays RN-import-free.
const MONO_STACK = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const HAIRLINE = 'rgba(255,255,255,0.1)';

export const clerkAppearance = {
  variables: {
    colorPrimary: C.lime,
    colorText: '#ffffff',
    colorTextOnPrimaryBackground: C.surface,
    colorTextSecondary: 'rgba(255,255,255,0.55)',
    colorBackground: C.surface,
    colorInputBackground: C.input,
    colorInputText: '#ffffff',
    colorNeutral: '#ffffff', // drives a light border/shadow ramp on the dark ground
    colorDanger: C.orange,
    colorSuccess: C.lime,
    borderRadius: `${R.lg}px`,
    fontFamily: MONO_STACK,
    fontFamilyButtons: MONO_STACK,
    fontSize: '14px',
  },
  elements: {
    card: {
      backgroundColor: C.surface,
      border: `1px solid ${HAIRLINE}`,
      borderRadius: `${R.xl2}px`,
      boxShadow: 'none',
    },
    modalContent: { borderRadius: `${R.xl2}px` },
    userButtonPopoverCard: {
      backgroundColor: C.surface,
      border: `1px solid ${HAIRLINE}`,
    },
    formButtonPrimary: {
      textTransform: 'none',
      fontWeight: '600',
      color: C.surface,
    },
    socialButtonsBlockButton: { border: `1px solid rgba(255,255,255,0.15)` },
    formFieldInput: {
      backgroundColor: C.input,
      border: `1px solid ${HAIRLINE}`,
    },
    dividerLine: { backgroundColor: HAIRLINE },
    footerActionLink: { color: C.lime },
  },
};
