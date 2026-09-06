import { View } from 'react-native';

import { CalendarScreen } from '@/calendar/CalendarScreen';
import { useMounted } from '@/design/useMounted';

/**
 * `/app` — the full Find time calendar (Month / Week / Day, 7 switchable
 * backgrounds, event CRUD) ported from design/from_user/calendar.html.
 *
 * Gated on `useMounted()`: under `web.output: "server"` this route is rendered in
 * Node first, where `useWindowDimensions()` measures 0×0 and every responsive
 * branch in the calendar picks the phone layout. Hydrating that against a desktop
 * viewport is a guaranteed mismatch, and the calendar is a logged-in app surface
 * with nothing for a crawler to read — so it renders a plain coloured box on the
 * server and mounts for real on the client. The landing page, which is the one
 * surface that actually needs SSR'd markup, is not gated.
 */
export default function CalendarRoute() {
  const mounted = useMounted();
  if (!mounted) return <View style={{ flex: 1, backgroundColor: '#2047e6' }} />;
  return <CalendarScreen />;
}
