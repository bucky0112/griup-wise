#!/usr/bin/env tsx

import * as dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';
import { admins } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Ensure environment variables are loaded
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create a connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create drizzle instance
const db = drizzle(pool);

async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

async function seedAdmins() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error(
      'SEED_ADMIN_PASSWORD environment variable is required. ' +
      'Run with: SEED_ADMIN_PASSWORD="your-password" pnpm db:seed-admins'
    );
  }

  const defaultAdmins = [
    {
      name: '系統管理員',
      email: 'admin@5xcampus.com',
      password: adminPassword,
    },
  ];

  console.log('🌱 Starting admin seeding...');

  try {
    for (const admin of defaultAdmins) {
      const passwordHash = await hashPassword(admin.password);

      const existingAdmin = await db
        .select()
        .from(admins)
        .where(eq(admins.email, admin.email))
        .limit(1);

      if (existingAdmin.length > 0) {
        await db
          .update(admins)
          .set({ name: admin.name, passwordHash })
          .where(eq(admins.email, admin.email));
        console.log(`🔄 Updated admin: ${admin.name} (${admin.email})`);
        continue;
      }

      const [newAdmin] = await db
        .insert(admins)
        .values({
          name: admin.name,
          email: admin.email,
          passwordHash,
        })
        .returning();

      console.log(`✅ Created admin: ${newAdmin.name} (${newAdmin.email})`);
    }

    console.log('🎉 Admin seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding admins:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the seeding script
if (require.main === module) {
  seedAdmins();
}

export { seedAdmins };
