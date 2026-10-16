import { defineConfig, devices } from '@playwright/test'

// E2E runs against a deployed or locally served build: set E2E_BASE_URL (default: the Vite dev
// server on :5173). E2E_CHANNEL=chrome uses an installed Chrome instead of Playwright's Chromium.
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env.E2E_CHANNEL },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], channel: process.env.E2E_CHANNEL },
    },
  ],
})
