import { LegalScreen } from '@/landing/LegalScreen';
import { TERMS } from '@/landing/legal-copy';

/** /terms — see src/landing/legal-copy.ts (first pass, pending counsel review). */
export default function Terms() {
  return (
    <LegalScreen
      title={TERMS.title}
      description="The terms that govern use of Find Time during its private beta."
      intro={TERMS.intro}
      sections={TERMS.sections}
    />
  );
}
