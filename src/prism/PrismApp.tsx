/**
 * Native (iOS/Android) has no Prism build yet: it keeps the existing calendar.
 * Web resolves PrismApp.web.tsx instead — the app built from the Prism artifact.
 */
import { CalendarScreen } from '@/calendar/CalendarScreen';

export function PrismApp() {
  return <CalendarScreen />;
}
