import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

/**
 * `calendar.html` is a single page: the only chrome is the calendar's own sticky
 * header (desktop) and its own fixed 5-item bottom nav (below lg, rendered by
 * `CalendarScreen`). So there is no router-level tab bar here — an Expo Router
 * `<Tabs>` renders its bar on web and desktop too, which the mockup never shows.
 *
 * "Plan with AI" is not a route either: it is the `AiPanel` slide-over, opened
 * from the header button on desktop and the "Ask AI" nav item on mobile.
 */
export default function RootLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#2047e6' } }}>
        <Stack.Screen name="index" />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}
