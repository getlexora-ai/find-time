import { expect, type Page, test } from '@playwright/test';

/**
 * The app under test must run with the same `E2E_FIXED_OTP` (and not in
 * production): every emailed code is then that value, so the specs can type
 * it (src/server/auth/auth.ts). Without it every spec is skipped.
 */
export const TEST_CODE = process.env.E2E_FIXED_OTP ?? '';

/** Skip a spec unless the app was started with a fixed test code. */
export function needsAuth() {
  test.skip(!TEST_CODE, 'Start the app and the tests with the same E2E_FIXED_OTP=123456 to run.');
}

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8081';

export const testEmail = (tag: string) => `findtime-e2e-${tag}-${Date.now()}@example.com`;
export const PASSWORD = 'e2e-Password-2026!';

export async function open(page: Page, path: string) {
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

/**
 * Remove a test user the way a person would: sign in through Better Auth's
 * API, then `DELETE /api/me` (wipes `users` + `auth_user` in one transaction).
 * Quietly does nothing if the account was never finished.
 */
export async function deleteTestUser(email: string) {
  const headers = { 'Content-Type': 'application/json', Origin: BASE };
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) return;
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  await fetch(`${BASE}/api/me`, { method: 'DELETE', headers: { Origin: BASE, Cookie: cookie } });
}
