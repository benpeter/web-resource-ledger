// tva
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,

  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://staging.webresourceledger.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'e2e',
      use: { browserName: 'chromium' },
    },
  ],

  reporter: [['html', { open: 'never' }]],

  globalSetup: './global-setup.js',
  globalTeardown: './global-teardown.js',
});
