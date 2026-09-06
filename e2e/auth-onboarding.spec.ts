import { test, expect } from "@playwright/test";

test("landing -> signup -> onboarding -> dashboard", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /start planning/i }).first().click();
  await expect(page).toHaveURL(/\/signup/);

  await page.getByRole("button", { name: /continue with google/i }).click();
  await page.waitForURL(/\/onboarding\/welcome/);
  await expect(page.getByRole("heading", { name: /welcome to find time/i })).toBeVisible();

  await page.getByRole("button", { name: /get started/i }).click();
  await expect(page).toHaveURL(/\/onboarding\/accounts/);

  // Skip straight through onboarding to the dashboard.
  await page.getByRole("button", { name: /skip/i }).click();
  await expect(page).toHaveURL(/\/app\/today/);
  await expect(page.getByText(/what are you building/i)).toBeVisible();
});
