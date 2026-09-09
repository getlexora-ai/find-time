import { LegalScreen } from '@/landing/LegalScreen';
import { PRIVACY } from '@/landing/legal-copy';

/** /privacy — see src/landing/legal-copy.ts (first pass, pending counsel review). */
export default function Privacy() {
  return (
    <LegalScreen
      title={PRIVACY.title}
      description="How Find Time collects, uses and protects your personal data, and your GDPR rights."
      intro={PRIVACY.intro}
      sections={PRIVACY.sections}
    />
  );
}
