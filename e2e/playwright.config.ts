import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end: sign up → verify → onboarding → app, and sign in, against a
 * running Find Time (`npx expo start --web` or `npx expo serve`) with a
 * database and `E2E_FIXED_OTP` set. See ./README.md for the env it needs.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8081',
    trace: 'retain-on-failure',
    // Playwright's own browser, or the preinstalled one in CI containers.
    launchOptions: process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, grep: /@phone/ },
  ],
});
