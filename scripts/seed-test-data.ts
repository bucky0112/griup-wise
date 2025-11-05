#!/usr/bin/env tsx

import * as dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { admins, classes, quizzes, questions } from '../src/lib/db/schema';
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

async function seedTestData() {
  console.log('🌱 Starting test data seeding...');

  try {
    // Get first admin for creating test data
    const adminList = await db.select().from(admins).limit(1);

    if (adminList.length === 0) {
      console.log('❌ No admin found. Please run seed-admins first.');
      return;
    }

    const admin = adminList[0];
    console.log(`✅ Using admin: ${admin.name} (${admin.email})`);

    // Create a test class
    const [testClass] = await db
      .insert(classes)
      .values({
        title: '測試班級 - 資訊工程系',
        expectedSize: 30,
        targetGroupSize: 5,
        createdBy: admin.id,
      })
      .returning();

    console.log(`✅ Created test class: ${testClass.title} (ID: ${testClass.id})`);

    // Create a test quiz
    const [testQuiz] = await db
      .insert(quizzes)
      .values({
        classId: testClass.id,
        title: '程式設計基礎測驗',
        isActive: true,
        showGroupPublicly: false,
        createdBy: admin.id,
      })
      .returning();

    console.log(`✅ Created test quiz: ${testQuiz.title}`);
    console.log(`📝 Quiz ID for student login: ${testQuiz.id}`);

    // Create some test questions
    const testQuestions = [
      {
        type: 'single' as const,
        prompt: '下列哪個是 JavaScript 的資料型別？',
        options: ['string', 'number', 'boolean', '以上皆是'],
        answerKey: 3, // 以上皆是
        score: '10',
        orderIndex: 1,
      },
      {
        type: 'boolean' as const,
        prompt: 'JavaScript 是強型別語言',
        options: null,
        answerKey: false,
        score: '10',
        orderIndex: 2,
      },
      {
        type: 'short_text' as const,
        prompt: '請寫出 JavaScript 中宣告變數的關鍵字（任一個即可）',
        options: null,
        answerKey: 'var',
        score: '15',
        orderIndex: 3,
      },
    ];

    for (const question of testQuestions) {
      await db.insert(questions).values({
        quizId: testQuiz.id,
        type: question.type,
        prompt: question.prompt,
        options: question.options,
        answerKey: question.answerKey,
        score: question.score,
        orderIndex: question.orderIndex,
      });
    }

    console.log(`✅ Created ${testQuestions.length} test questions`);

    console.log('\n🎉 Test data seeding completed successfully!');
    console.log('\n📋 Test Information:');
    console.log(`   Admin Email: ${admin.email}`);
    console.log(`   Class: ${testClass.title}`);
    console.log(`   Quiz: ${testQuiz.title}`);
    console.log(`   Quiz ID: ${testQuiz.id}`);
    console.log('\n💡 You can now use this Quiz ID for student login testing.');

  } catch (error) {
    console.error('❌ Error seeding test data:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the seeding script
if (require.main === module) {
  seedTestData();
}

export { seedTestData };