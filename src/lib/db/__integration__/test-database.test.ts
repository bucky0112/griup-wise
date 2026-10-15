import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, admins } from '@/lib/db';
import { truncateTables } from '@/test/db';

describe('test database', () => {
  beforeEach(async () => {
    await truncateTables(['admins']);
  });

  it('writes and reads rows in the migrated test database', async () => {
    const [created] = await db
      .insert(admins)
      .values({ name: 'Test Admin', email: 'test-admin@example.com', passwordHash: 'not-a-real-hash' })
      .returning();

    const [found] = await db.select().from(admins).where(eq(admins.id, created.id));

    expect(found.email).toBe('test-admin@example.com');
    expect(process.env.DATABASE_URL).toContain('group_wise_test');
  });
});
