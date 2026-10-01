import { Redirect } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { previewAccounts as setPreviewAccounts } from '@/calendar/account-store';
import { startPreview } from '@/calendar/cal-store';
import { CalendarScreen } from '@/calendar/CalendarScreen';
import { ToastProvider } from '@/calendar/components/Toast';
import { previewAccounts, previewEvents } from '@/calendar/preview/fixture';
import { useMounted } from '@/design/useMounted';

/**
 * `/preview` — DEV ONLY. The calendar on a fixture week with no account and no
 * network, so the design and every gesture can be checked (and screenshotted)
 * without signing in. Production builds redirect home.
 */
export default function Preview() {
  const mounted = useMounted();
  // Once, on first render of this route only — never at import, so the real
  // `/app` store is untouched unless you actually open /preview.
  const [ready] = useState(() => {
    if (!__DEV__) return false;
    startPreview(previewEvents());
    setPreviewAccounts(previewAccounts());
    return true;
  });

  if (!__DEV__) return <Redirect href="/" />;
  if (!mounted || !ready) return <View style={{ flex: 1, backgroundColor: '#FAFAFA' }} />;
  return (
    <ToastProvider>
      <CalendarScreen />
    </ToastProvider>
  );
}
