import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, type Page, test } from '@playwright/test';

export const HAS_CLERK = Boolean(
  (process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY) && process.env.CLERK_SECRET_KEY,
);

/** Skip a spec unless a Clerk dev instance is configured. */
export function needsClerk() {
  test.skip(!HAS_CLERK, 'Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY (dev instance) to run.');
}

/**
 * Clerk test mode: any `+clerk_test` address on a dev instance accepts the
 * code 424242 and sends no email.
 * https://clerk.com/docs/testing/test-emails-and-phones
 */
export const TEST_CODE = '424242';
export const testEmail = (tag: string) => `findtime-e2e-${tag}-${Date.now()}+clerk_test@example.com`;
export const PASSWORD = 'e2e-Password-2026!';

export async function open(page: Page, path: string) {
  if (HAS_CLERK) await setupClerkTestingToken({ page });
  await page.goto(path);
}

/** Type the 6-digit code; the Otp component auto-submits on the last digit. */
export async function enterCode(page: Page, code = TEST_CODE) {
  await page.getByRole('group', { name: '6-digit code' }).getByRole('textbox').first().click();
  await page.keyboard.type(code);
}

export async function signUp(page: Page, email: string) {
  await open(page, '/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await enterCode(page);
}

/** Remove a test user through the Clerk Backend API (cascades our DB rows via DELETE /api/me is not needed: the user never connected anything). */
export async function deleteClerkUser(email: string) {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) return;
  const h = { Authorization: `Bearer ${key}` };
  const res = await fetch(`https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`, { headers: h });
  if (!res.ok) return;
  const users = (await res.json()) as { id: string }[];
  for (const u of users) await fetch(`https://api.clerk.com/v1/users/${u.id}`, { method: 'DELETE', headers: h });
}
