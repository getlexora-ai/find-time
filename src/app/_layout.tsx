import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import '../global.css';

/**
 * Root layout. Two routes hang off it:
 *
 *   `index` → the marketing landing page on web (`index.web.tsx`), and a bare
 *             redirect to `/app` on native (`index.tsx`).
 *   `app`   → the calendar, which owns its own providers in `app/_layout.tsx`.
 *
 * The calendar's `CalendarThemeProvider` / `ToastProvider` deliberately do *not*
 * live here: the landing pins its own `electric` ground and must not read or write
 * the background theme the user picked in the calendar.
 */
export default function RootLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#2047e6' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="app" />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}
