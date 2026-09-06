import { test, expect } from "@playwright/test";
import { loginAsDemoUser, skipOnboarding } from "./helpers";

test("create an event from the toolbar and drag-reschedule it", async ({ page }) => {
  await loginAsDemoUser(page);
  await skipOnboarding(page);

  await page.goto("/app/calendar/day");
  const addEventButton = page.getByRole("button", { name: /add event/i });
  await expect(addEventButton).toBeVisible();

  const before = await page.getByRole("button", { name: /^New event,/ }).count();

  await addEventButton.click();

  const events = page.getByRole("button", { name: /^New event,/ });
  await expect(events).toHaveCount(before + 1);

  // Pin an ElementHandle to the exact DOM node so a re-render (e.g. list
  // reordering by start time) can't make us grab a different event.
  const created = await events.last().elementHandle();
  if (!created) throw new Error("created event has no element handle");
  const beforeLabel = await created.getAttribute("aria-label");
  const box = await created.boundingBox();
  if (!box) throw new Error("created event has no bounding box");

  // Drag it down by one hour row (DEFAULT_HOUR_HEIGHT = 64px).
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 64, { steps: 8 });
  await page.mouse.up();

  await expect(async () => {
    const afterLabel = await created.getAttribute("aria-label");
    expect(afterLabel).not.toBe(beforeLabel);
  }).toPass({ timeout: 5000 });
});
