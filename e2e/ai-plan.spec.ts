import { test, expect } from "@playwright/test";
import { loginAsDemoUser, skipOnboarding } from "./helpers";

test("generate an AI draft plan, review it, apply it, then undo", async ({ page }) => {
  await loginAsDemoUser(page);
  await skipOnboarding(page);

  await page.getByPlaceholder(/help me plan a mobile app launch/i).fill("Plan my week");
  await page.getByRole("button", { name: /generate plan/i }).click();

  await expect(page.getByRole("button", { name: /review/i })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /review/i }).click();

  await page.goto("/app/plan");
  await expect(page.getByText(/draft plan/i)).toBeVisible();
  const applyButton = page.getByRole("button", { name: /^apply all$/i });
  await expect(applyButton).toBeVisible();

  await applyButton.click();
  const undoButton = page.getByRole("button", { name: /^undo$/i });
  await expect(undoButton).toBeVisible({ timeout: 10_000 });
  await undoButton.click();

  await expect(page.getByText(/plan applied to your calendar/i)).toBeHidden({ timeout: 10_000 });
});
