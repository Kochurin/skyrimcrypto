import { defineConfig } from 'vitest/config';

// Интеграционные тесты: нужны PostgreSQL и MinIO (docker compose up -d).
export default defineConfig({
  test: {
    include: ['apps/*/test-integration/**/*.test.ts'],
    testTimeout: 60_000,
    fileParallelism: false,
  },
});
