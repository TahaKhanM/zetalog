import { defineConfig } from '@playwright/test';

/**
 * Playwright config for the web app's full-stack e2e (W7 bug 3 regression).
 *
 * The single spec is OPT-IN (skipped unless `ZL_FULLSTACK=1`), because it needs
 * a local Supabase stack (`supabase start`) and boots `next dev` itself — the
 * same posture as the extension's optional full-stack smoke, so the default
 * test run and CI stay Docker-free.
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
