import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests: the real app in Chromium (WebHID needs it), against a
 * fake F75 installed as navigator.hid (test/fixtures/fake-hid.ts) or the
 * built-in mock keyboard.
 *
 * First run: `npx playwright install chromium`. To use a browser that is
 * already installed instead, set CHROMIUM_PATH to its executable.
 */
export default defineConfig({
  testDir: 'test',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
