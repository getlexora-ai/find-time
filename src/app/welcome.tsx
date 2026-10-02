import { Redirect } from 'expo-router';

/** `/welcome` on native — onboarding is web-only for now; go straight to the app. */
export default function Welcome() {
  return <Redirect href="/app" />;
}
