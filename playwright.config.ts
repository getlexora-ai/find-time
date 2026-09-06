import { defineConfig, devices } from "@playwright/test";

/**
 * Next.js refuses to start a second dev server for the same project
 * directory even on a different port, so this reuses whatever dev server
 * is already up on :3457 rather than trying to spawn its own. The store is
 * in-memory and only seeded once per server process (server/store/seed.ts),
 * so specs are written to be robust to state left over by a prior run
 * (count diffs, not assumptions of a pristine store) rather than requiring
 * a fresh process.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3457",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npx next dev -p 3457",
    url: "http://localhost:3457",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
