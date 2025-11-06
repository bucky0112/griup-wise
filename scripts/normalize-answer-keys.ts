#!/usr/bin/env tsx

/**
 * Database migration script to normalize answerKey format
 *
 * This script ensures all answerKey values in the questions table are arrays,
 * converting primitive values to single-element arrays for consistency.
 *
 * Run with: npm run db:normalize-answers
 */

import * as dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { questions } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Ensure environment variables are loaded
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

async function normalizeAnswerKeys() {
  console.log('🔄 Starting answerKey normalization...');

  try {
    // Fetch all questions
    const allQuestions = await db
      .select()
      .from(questions)
      .orderBy(questions.orderIndex);

    console.log(`📊 Found ${allQuestions.length} questions to check`);

    let updatedCount = 0;

    for (const question of allQuestions) {
      const currentAnswerKey = question.answerKey;
      let needsUpdate = false;
      let normalizedAnswerKey;

      // Check if answerKey is not an array
      if (!Array.isArray(currentAnswerKey)) {
        needsUpdate = true;
        // Convert primitive to array
        normalizedAnswerKey = [currentAnswerKey];
      } else {
        normalizedAnswerKey = currentAnswerKey;
      }

      if (needsUpdate) {
        console.log(`📝 Normalizing question ${question.id} (${question.type})`);
        console.log(`   Old: ${JSON.stringify(currentAnswerKey)}`);
        console.log(`   New: ${JSON.stringify(normalizedAnswerKey)}`);

        // Update the question with normalized answerKey
        await db
          .update(questions)
          .set({ answerKey: normalizedAnswerKey })
          .where(eq(questions.id, question.id));

        updatedCount++;
      }
    }

    console.log(`✅ Normalization complete!`);
    console.log(`📈 Updated ${updatedCount} out of ${allQuestions.length} questions`);

    if (updatedCount === 0) {
      console.log('🎉 All answerKey values were already in array format');
    }

    // Close database connection
    await pool.end();

  } catch (error) {
    console.error('❌ Error during normalization:', error);
    await pool.end();
    process.exit(1);
  }
}

// Run the normalization
normalizeAnswerKeys()
  .then(() => {
    console.log('🏁 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });