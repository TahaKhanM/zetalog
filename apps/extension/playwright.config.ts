import { defineConfig } from '@playwright/test';

/**
 * Playwright config for the extension e2e. The required suite
 * loads the built extension against an OFFLINE Zetamac replica — never the live
 * site, never Docker — so it is safe to run in CI. Serial, single worker: the
 * tests share one persistent browser context with the extension loaded.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  timeout: 120_000,
  expect: { timeout: 10_000 },
});
