import { defineConfig, devices } from "@playwright/test";

// Browser tests: the app against its real Worker and Durable Objects (the Vite dev server runs them), on a phone-sized
// touch screen and on a desktop-sized one. Each test makes its own space, so tests run in parallel.
const PORT = 5288;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
  },
  projects: [
    {
      // Chromium, for the touch events gestures need (sent through the DevTools protocol).
      name: "phone",
      use: { ...devices["iPhone 13"], browserName: "chromium", deviceScaleFactor: 1 },
      testIgnore: /desktop\.spec\.ts/,
    },
    {
      name: "desktop",
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
      testMatch: /desktop\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
