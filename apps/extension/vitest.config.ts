import { defineConfig } from 'vitest/config';

/** 100% on every metric — the bar for the pure cores (CLAUDE.md quality bar). */
const FULL = { statements: 100, branches: 100, functions: 100, lines: 100 } as const;

export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts', 'lib/**/*.tsx', 'components/**/*.tsx'],
      thresholds: {
        // The pure cores are quant-grade: 100% of their branches, locked in so
        // a regression fails CI rather than silently eroding coverage. (Vitest
        // threshold globs do not expand braces, so each file is listed.)
        '**/selectors.ts': FULL,
        '**/settings.ts': FULL,
        '**/recorder.ts': FULL,
        '**/stats.ts': FULL,
        '**/store.ts': FULL,
        '**/format.ts': FULL,
        '**/auth.ts': FULL,
        '**/api.ts': FULL,
        '**/sync.ts': FULL,
      },
    },
  },
});
