import { CalendarScreen } from '@/calendar/CalendarScreen';
import { ToastProvider } from '@/calendar/components/Toast';
import { CalendarThemeProvider } from '@/calendar/theme-context';

/**
 * Calendar tab — the full Find time calendar (Month / Week / Day, 7 switchable
 * backgrounds, event CRUD) ported from design/from_user/calendar.html.
 * Providers wrap the screen: background theme first (Toast reads it), then Toast.
 */
export default function CalendarRoute() {
  return (
    <CalendarThemeProvider>
      <ToastProvider>
        <CalendarScreen />
      </ToastProvider>
    </CalendarThemeProvider>
  );
}
