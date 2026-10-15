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
    // The Jest-based tests in src/lib/grouping/__tests__ are not runnable yet and stay excluded.
    include: ['src/**/__integration__/**/*.test.ts'],
    globalSetup: ['./src/test/db.ts'],
    env: {
      DATABASE_URL: resolveTestDatabaseUrl(),
    },
    // Integration tests share one database, so files must not run concurrently.
    fileParallelism: false,
  },
});
