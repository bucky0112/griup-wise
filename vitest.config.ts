import path from 'path';
import { defineConfig } from 'vitest/config';
import { resolveTestDatabaseUrl } from './src/test/db';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // __unit__ tests are pure; __integration__ tests use the PostgreSQL test database.
    include: ['src/**/__unit__/**/*.test.ts', 'src/**/__integration__/**/*.test.ts'],
    globalSetup: ['./src/test/db.ts'],
    env: {
      DATABASE_URL: resolveTestDatabaseUrl(),
    },
    // Integration tests share one database, so files must not run concurrently.
    fileParallelism: false,
  },
});
