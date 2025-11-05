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

// Default admin accounts to seed
const defaultAdmins = [
  {
    name: '系統管理員',
    email: 'admin@example.com',
    password: 'admin123', // This should be changed in production
  },
  {
    name: '測試管理員',
    email: 'test@example.com',
    password: 'test123', // This should be changed in production
  },
];

async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

async function seedAdmins() {
  console.log('🌱 Starting admin seeding...');

  try {
    for (const admin of defaultAdmins) {
      // Check if admin already exists
      const existingAdmin = await db
        .select()
        .from(admins)
        .where(eq(admins.email, admin.email))
        .limit(1);

      if (existingAdmin.length > 0) {
        console.log(`⚠️  Admin with email ${admin.email} already exists, skipping...`);
        continue;
      }

      // Hash the password
      const passwordHash = await hashPassword(admin.password);

      // Insert the admin
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