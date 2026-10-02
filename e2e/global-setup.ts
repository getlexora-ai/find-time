import { clerkSetup } from '@clerk/testing/playwright';

/**
 * Fetches a Clerk testing token (needs the dev instance's secret key) so the
 * tests get past bot protection. Skipped when the keys aren't set — the specs
 * skip themselves in that case too.
 */
export default async function globalSetup() {
  const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;
  if (!publishableKey || !process.env.CLERK_SECRET_KEY) return;
  await clerkSetup({ publishableKey });
}
