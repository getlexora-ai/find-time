import { expect, test } from '@playwright/test';

import { deleteClerkUser, needsClerk, open, PASSWORD, signUp, testEmail } from './helpers';

/**
 * The whole first-run path, then the return visit:
 *   /signup → code → /welcome (5 steps, preview reacting) → done → /app
 *   sign out → /login → /app directly (onboarded), /welcome bounces to /app
 */
test.describe('sign up → onboarding → app', () => {
  needsClerk();
  const email = testEmail('flow');
  test.afterAll(async () => deleteClerkUser(email));

  test('a new account is set up and lands in the app', async ({ page }) => {
    await signUp(page, email);

    // Onboarding opens on step 1, focus starts in the name field.
    await expect(page).toHaveURL(/\/welcome/);
    await expect(page.getByRole('heading', { name: /What should we call you/ })).toBeVisible();
    await page.getByLabel('First name').fill('Ada');
    await page.keyboard.press('Enter');

    // Focus follows the step: the new question is focused for keyboard / screen-reader users.
    const calendarQ = page.getByRole('heading', { name: /real meetings|calendar is connected/ });
    await expect(calendarQ).toBeFocused();
    await page.getByRole('button', { name: 'Use an example week' }).click();

    // Week: switch Saturday on — the preview's day header un-hatches.
    await expect(page.getByRole('heading', { name: 'When do you work?' })).toBeFocused();
    await page.getByRole('button', { name: 'Saturday' }).click();
    await expect(page.getByRole('button', { name: 'Saturday' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: /^Continue/ }).click();

    // Peak: afternoon. Deep-work blocks appear in the preview from here on.
    await page.getByText('Afternoon', { exact: true }).click();
    await expect(page.locator('.mw-blk[data-kind="focus"]').first()).toBeVisible();
    await page.getByRole('button', { name: /^Continue/ }).click();

    // Focus: 4 h, clustered.
    await page.getByLabel('Each working day').fill('4');
    await page.getByRole('button', { name: /Cluster it/ }).click();
    await page.getByRole('button', { name: 'Finish setup' }).click();

    await expect(page.getByRole('heading', { name: 'Your week is ready, Ada.' })).toBeFocused();
    await expect(page.getByText('4 h a day, clustered')).toBeVisible();
    await page.getByRole('button', { name: /Open my week/ }).click();
    await expect(page).toHaveURL(/\/app/);

    // Onboarded: /welcome now sends you straight on.
    await page.goto('/welcome');
    await expect(page).toHaveURL(/\/app/);
  });

  test('signing in again goes straight to the app', async ({ page }) => {
    await open(page, '/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: /^Sign in/ }).click();
    await expect(page).toHaveURL(/\/app/);
  });
});

test.describe('skipping', () => {
  needsClerk();
  const email = testEmail('skip');
  test.afterAll(async () => deleteClerkUser(email));

  test('skip for now marks setup done without saving answers', async ({ page }) => {
    await signUp(page, email);
    await expect(page).toHaveURL(/\/welcome/);
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await expect(page).toHaveURL(/\/app/);
  });
});

test.describe('sign-in errors', () => {
  needsClerk();

  test('bad email and wrong password explain themselves', async ({ page }) => {
    await open(page, '/login');
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByRole('button', { name: /^Sign in/ }).click();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();

    await page.getByLabel('Email').fill(testEmail('nobody'));
    await page.getByLabel('Password', { exact: true }).fill('whatever-123');
    await page.getByRole('button', { name: /^Sign in/ }).click();
    await expect(page.getByText(/No account uses that email|password is not right/)).toBeVisible();
  });

  test('signed-out /app goes to /login', async ({ page }) => {
    await open(page, '/app');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('phone layout @phone', () => {
  needsClerk();
  const email = testEmail('phone');
  test.afterAll(async () => deleteClerkUser(email));

  test('the sticky strip shows the week while answering', async ({ page }) => {
    await signUp(page, email);
    await expect(page).toHaveURL(/\/welcome/);
    const strip = page.locator('.fs');
    await expect(strip).toBeVisible();
    await expect(strip).toContainText('5 days');
  });
});
