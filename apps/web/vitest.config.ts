import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mirror the tsconfig `@/*` path alias so route/component tests resolve it.
  resolve: {
    alias: { '@': import.meta.dirname },
  },
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts', 'app/api/**/*.ts'],
    },
  },
});
