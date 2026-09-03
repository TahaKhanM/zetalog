import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // Next preserves JSX for its own compiler; Vitest still needs to transform
  // Client Component imports when a focused DOM test exercises their effects.
  oxc: { jsx: { runtime: 'automatic' } },
  // Mirror the tsconfig `@/*` path alias so route/component tests resolve it.
  resolve: {
    alias: { '@': import.meta.dirname },
  },
  test: {
    environment: 'node',
    // The Playwright e2e (`e2e/*.spec.ts`) is run by `pnpm test:e2e`, not vitest.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts', 'app/api/**/*.ts'],
    },
  },
});
