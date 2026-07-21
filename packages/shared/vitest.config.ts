import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // `*.testkit.ts` files are test-only fixtures (e.g. the faithful Zetamac
      // generator port), never shipped and never imported by `index.ts`.
      exclude: ['src/**/*.test.ts', 'src/**/*.testkit.ts'],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
