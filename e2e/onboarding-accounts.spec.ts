import { test, expect } from "@playwright/test";
import { loginAsDemoUser } from "./helpers";

test("connect a Gmail account during onboarding", async ({ page }) => {
  await loginAsDemoUser(page);
  await page.getByRole("button", { name: /get started/i }).click();
  await expect(page).toHaveURL(/\/onboarding\/accounts/);

  const googleCard = page.getByRole("button", { name: /gmail \+ google calendar/i });
  await expect(googleCard).toBeVisible();
  await googleCard.click();

  // Connecting state, then the account settles into a connected row with a live sync status.
  await expect(page.getByText(/connecting/i)).toBeVisible();
  await expect(page.getByText(/connecting/i)).toBeHidden({ timeout: 5000 });
  await expect(page.getByText(/^(live|syncing)$/i).first()).toBeVisible();
});
