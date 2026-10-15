import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, admins } from '@/lib/db';
import { isSameDatabase, truncateTables } from '@/test/db';

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

describe('isSameDatabase', () => {
  const dev = 'postgresql://user:secret@localhost:5432/group_wise';

  it.each([
    ['postgresql://localhost/group_wise', 'default port, no credentials'],
    ['postgres://other@127.0.0.1:5432/group_wise', 'postgres scheme and loopback IP'],
    ['postgresql://[::1]/group_wise?sslmode=disable', 'IPv6 loopback with query string'],
  ])('treats %s as the dev database (%s)', (url) => {
    expect(isSameDatabase(dev, url)).toBe(true);
  });

  it.each([
    ['postgresql://localhost:5432/group_wise_test', 'different database name'],
    ['postgresql://localhost:5433/group_wise', 'different port'],
    ['postgresql://db.example.com:5432/group_wise', 'different host'],
  ])('treats %s as a different database (%s)', (url) => {
    expect(isSameDatabase(dev, url)).toBe(false);
  });
});
