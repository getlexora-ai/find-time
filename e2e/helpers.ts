import type { Page } from "@playwright/test";

/** Signs in via the real UI flow ("Continue with Google" is a one-click mock). */
export async function loginAsDemoUser(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /continue with google/i }).click();
  await page.waitForURL(/\/onboarding\/welcome|\/app\/today/);
}

/** Skips the rest of onboarding straight to the dashboard. */
export async function skipOnboarding(page: Page) {
  await page.getByRole("button", { name: /skip/i }).click();
  await page.waitForURL(/\/app\/today/);
}
