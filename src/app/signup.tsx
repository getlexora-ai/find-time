import { Redirect } from 'expo-router';

/** `/signup` on native — `login.tsx` already toggles between sign in and sign up. */
export default function Signup() {
  return <Redirect href="/login" />;
}
