import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

let pool: Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function initializeDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  if (!_db) {
    _db = drizzle(pool, { schema });
  }

  return _db;
}

// Create drizzle instance with lazy initialization
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(target, prop) {
    const dbInstance = initializeDb();
    return (dbInstance as any)[prop];
  }
});

// Export all schema for convenience
export * from './schema';

// Export types
export type Database = typeof db;