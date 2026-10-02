import { Redirect } from 'expo-router';

/** `/sso-callback` on native — SSO completes in-app via `useSSO`; nothing lands here. */
export default function SsoCallback() {
  return <Redirect href="/app" />;
}
