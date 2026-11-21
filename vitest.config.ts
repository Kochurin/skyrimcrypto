import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.{ts,tsx}'],
    testTimeout: 30_000,
    // NFR-13: покрытие криптомодуля не ниже 95% — `npm run test:coverage` падает, если меньше
    coverage: {
      provider: 'v8',
      include: ['packages/crypto/src/**/*.ts'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 95 },
    },
  },
});
