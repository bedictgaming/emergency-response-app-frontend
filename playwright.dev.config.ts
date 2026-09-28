import { defineConfig, devices } from '@playwright/test';

// Diagnostic browser suite against an already-running local Next dev server.
// PWA installation requires the separate production-export suite.
export default defineConfig({
  testDir: './e2e',
  testIgnore: /pwa\.spec\.ts/,
  fullyParallel: true,
  reporter: 'list',
  // Live Turbopack compilation on OneDrive can delay the first navigation.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
