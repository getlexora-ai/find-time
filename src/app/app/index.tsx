import { useAuth } from '@clerk/clerk-expo';
import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { refreshAccounts } from '@/calendar/account-store';
import { CalendarScreen } from '@/calendar/CalendarScreen';
import { useMounted } from '@/design/useMounted';

/**
 * `/app` — the full Find time calendar (Month / Week / Day, 7 switchable
 * backgrounds, event CRUD) ported from design/from_user/calendar.html.
 *
 * Gated on `useMounted()`: under `web.output: "server"` this route renders in
 * Node first, where `useWindowDimensions()` measures 0×0 and every responsive
 * branch picks the phone layout — a guaranteed hydration mismatch against a
 * desktop viewport, and there is nothing here for a crawler. So it paints a
 * plain box on the server and mounts for real on the client.
 *
 * Also gated on Clerk: no session → redirect to `/login`. Once signed in we
 * prime the account store (its fetch needs the session token, which only exists
 * after ClerkProvider has loaded).
 */
export default function CalendarRoute() {
  const mounted = useMounted();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (isLoaded && isSignedIn) void refreshAccounts();
  }, [isLoaded, isSignedIn]);

  if (!mounted || !isLoaded) return <View style={{ flex: 1, backgroundColor: '#2047e6' }} />;
  if (!isSignedIn) return <Redirect href="/login" />;
  return <CalendarScreen />;
}
