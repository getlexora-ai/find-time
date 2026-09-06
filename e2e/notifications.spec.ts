import { test, expect } from "@playwright/test";
import { loginAsDemoUser, skipOnboarding } from "./helpers";

test("view notifications and mark all as read", async ({ page }) => {
  await loginAsDemoUser(page);
  await skipOnboarding(page);

  await page.goto("/app/notifications");
  await expect(page.getByRole("heading")).toBeVisible();
  // Let the notifications query settle so the unread count (and the button's
  // disabled state derived from it) reflects real data, not the pre-fetch default.
  await expect(page.locator(".animate-pulse")).toHaveCount(0);

  const markAllRead = page.getByRole("button", { name: /mark all read/i });

  const wasEnabled = await markAllRead.isEnabled();
  if (wasEnabled) {
    await markAllRead.click();
    await expect(markAllRead).toBeDisabled({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: /all caught up/i })).toBeVisible();
  } else {
    // Already all read (persisted from a prior run against this dev server) — verify the empty/caught-up state instead.
    await expect(page.getByRole("heading", { name: /all caught up/i })).toBeVisible();
  }
});
