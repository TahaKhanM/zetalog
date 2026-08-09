import { defineConfig } from '@playwright/test';

/**
 * Playwright config for the web app's full-stack e2e.
 *
 * The suite is opt-in locally (skipped unless `ZL_FULLSTACK=1`) because it needs
 * a local Supabase stack and boots Next.js itself. CI sets the flag and runs it
 * against a fresh database after applying every migration.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  timeout: 180_000,
  expect: { timeout: 15_000 },
});
