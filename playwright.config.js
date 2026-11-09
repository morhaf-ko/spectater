import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  reporter: 'list',
  use: { channel: 'chrome', headless: true, viewport: { width: 1440, height: 900 } },
});
