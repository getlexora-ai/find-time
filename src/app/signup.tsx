import { Redirect } from 'expo-router';

/** `/signup` on native — `login.tsx` in sign-up mode. */
export default function Signup() {
  return <Redirect href="/login?mode=signup" />;
}
