import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile-chromium',
      testMatch: /pwa\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    // Reuse a verified export when OneDrive holds a live .next chunk open.
    // The default still builds a fresh isolated export for CI.
    command: process.env.EMERGENCY_E2E_PREBUILT_EXPORT
      ? 'node scripts/serve-export.mjs'
      : 'node scripts/build-e2e.mjs && node scripts/serve-export.mjs',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
