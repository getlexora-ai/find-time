import { Redirect } from 'expo-router';

/**
 * `/` on **native only** — `index.web.tsx` takes this route on web.
 *
 * The landing page is a web marketing surface; there is nothing to show a user who
 * already has the app installed, so iOS/Android send `/` (and the `findtime:///`
 * deep link) straight to the calendar. Splitting by filename rather than branching
 * on `Platform.OS` keeps the whole landing tree out of the native bundle.
 */
export default function Index() {
  return <Redirect href="/app" />;
}
