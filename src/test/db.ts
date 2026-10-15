import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const DEFAULT_TEST_DATABASE_URL = 'postgresql://localhost:5432/group_wise_test';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

// Compares where two connection strings point, ignoring credentials, scheme spelling and query options.
export function isSameDatabase(a: string, b: string): boolean {
  const target = (connectionString: string) => {
    const url = new URL(connectionString);
    const host = LOOPBACK_HOSTS.has(url.hostname) ? 'localhost' : url.hostname;
    return `${host}:${url.port || '5432'}/${decodeURIComponent(url.pathname.replace(/^\//, ''))}`;
  };
  return target(a) === target(b);
}

// Integration tests write and truncate tables, so they must never point at the dev database.
export function resolveTestDatabaseUrl(): string {
  const testUrl = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;

  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envLocalPath)) {
    const devUrl = dotenv.parse(fs.readFileSync(envLocalPath)).DATABASE_URL;
    if (devUrl && isSameDatabase(devUrl, testUrl)) {
      throw new Error(
        'TEST_DATABASE_URL points at the dev database from .env.local. ' +
        'Use a dedicated test database, e.g. createdb group_wise_test'
      );
    }
  }

  return testUrl;
}

// Vitest globalSetup: bring the test database schema up to date once per run.
export default async function setup() {
  const pool = new Pool({ connectionString: resolveTestDatabaseUrl() });
  try {
    await migrate(drizzle(pool), { migrationsFolder: './src/lib/db/migrations' });
  } catch (error) {
    throw new Error(
      'Failed to migrate the test database. Create it with: createdb group_wise_test',
      { cause: error }
    );
  } finally {
    await pool.end();
  }
}

export async function truncateTables(tableNames: string[]) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const tables = tableNames.map((name) => `"${name}"`).join(', ');
    await pool.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  } finally {
    await pool.end();
  }
}
