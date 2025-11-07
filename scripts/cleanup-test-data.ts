#!/usr/bin/env tsx

import * as dotenv from 'dotenv';
import * as readline from 'readline';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  quizzes,
  participants,
  submissions,
  answers,
  groups,
  groupMembers,
  groupingRuns
} from '../src/lib/db/schema';
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

// Create readline interface for CLI interaction
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Prompt for Quiz ID
function promptQuizId(): Promise<string> {
  return new Promise((resolve) => {
    const args = process.argv.slice(2);
    const quizIdArg = args.find(arg => arg.startsWith('--quiz-id='));

    if (quizIdArg) {
      const quizId = quizIdArg.split('=')[1];
      console.log(`使用命令行參數 Quiz ID: ${quizId}`);
      resolve(quizId);
      return;
    }

    const envQuizId = process.env.QUIZ_ID;
    if (envQuizId) {
      console.log(`使用環境變數 Quiz ID: ${envQuizId}`);
      resolve(envQuizId);
      return;
    }

    rl.question('請輸入要清理資料的 Quiz ID: ', (quizId) => {
      resolve(quizId.trim());
    });
  });
}

// Prompt for confirmation
function promptConfirmation(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function cleanupTestData() {
  console.log('🧹 測試資料清理工具');
  console.log('此腳本將移除指定 Quiz 的所有參與者、答題和分組資料\n');

  try {
    // Get Quiz ID
    const quizId = await promptQuizId();

    if (!quizId) {
      console.log('❌ Quiz ID 不能為空');
      rl.close();
      return;
    }

    // Verify quiz exists
    console.log(`🔍 驗證 Quiz ID: ${quizId}`);
    const quiz = await db
      .select({
        id: quizzes.id,
        title: quizzes.title,
      })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);

    if (quiz.length === 0) {
      console.log('❌ Quiz 不存在，請檢查 Quiz ID');
      rl.close();
      return;
    }

    console.log(`✅ 找到 Quiz: ${quiz[0].title}`);

    // Get current data counts
    console.log('\n📊 目前資料統計:');

    const participantCount = await db
      .select({ count: participants.id })
      .from(participants)
      .where(eq(participants.quizId, quizId));

    const submissionCount = await db
      .select({ count: submissions.id })
      .from(submissions)
      .where(eq(submissions.quizId, quizId));

    const groupCount = await db
      .select({ count: groups.id })
      .from(groups)
      .where(eq(groups.quizId, quizId));

    const groupingRunCount = await db
      .select({ count: groupingRuns.id })
      .from(groupingRuns)
      .where(eq(groupingRuns.quizId, quizId));

    console.log(`   參與者: ${participantCount.length} 位`);
    console.log(`   提交記錄: ${submissionCount.length} 筆`);
    console.log(`   分組: ${groupCount.length} 個`);
    console.log(`   分組執行記錄: ${groupingRunCount.length} 筆`);

    if (participantCount.length === 0 && submissionCount.length === 0 && groupCount.length === 0) {
      console.log('\n✅ 此 Quiz 沒有測試資料需要清理');
      rl.close();
      return;
    }

    // Ask for confirmation
    console.log('\n⚠️  警告: 此操作將永久刪除以下資料:');
    console.log('   - 所有參與者記錄');
    console.log('   - 所有答題和提交記錄');
    console.log('   - 所有分組和分組成員記錄');
    console.log('   - 所有分組執行記錄');

    const confirmed = await promptConfirmation('\n確定要繼續嗎？');

    if (!confirmed) {
      console.log('❌ 取消清理操作');
      rl.close();
      return;
    }

    console.log('\n🚀 開始清理資料...');

    // Perform cleanup in transaction to ensure data consistency
    await db.transaction(async (tx) => {
      // 1. Delete group members (references groups)
      if (groupCount.length > 0) {
        console.log('   清理分組成員...');

        // Get all group IDs for this quiz
        const quizGroups = await tx
          .select({ id: groups.id })
          .from(groups)
          .where(eq(groups.quizId, quizId));

        for (const group of quizGroups) {
          await tx.delete(groupMembers).where(eq(groupMembers.groupId, group.id));
        }
      }

      // 2. Delete groups
      if (groupCount.length > 0) {
        console.log('   清理分組...');
        await tx.delete(groups).where(eq(groups.quizId, quizId));
        console.log(`     已刪除 ${groupCount.length} 個分組`);
      }

      // 3. Delete grouping runs
      if (groupingRunCount.length > 0) {
        console.log('   清理分組執行記錄...');
        await tx.delete(groupingRuns).where(eq(groupingRuns.quizId, quizId));
        console.log(`     已刪除 ${groupingRunCount.length} 筆分組執行記錄`);
      }

      // 4. Delete answers (references submissions)
      if (submissionCount.length > 0) {
        console.log('   清理答題記錄...');

        // Get all submission IDs for this quiz
        const quizSubmissions = await tx
          .select({ id: submissions.id })
          .from(submissions)
          .where(eq(submissions.quizId, quizId));

        let answerCount = 0;
        for (const submission of quizSubmissions) {
          const result = await tx.delete(answers).where(eq(answers.submissionId, submission.id));
          answerCount += result.rowCount || 0;
        }

        console.log(`     已刪除 ${answerCount} 筆答題記錄`);
      }

      // 5. Delete submissions
      if (submissionCount.length > 0) {
        console.log('   清理提交記錄...');
        await tx.delete(submissions).where(eq(submissions.quizId, quizId));
        console.log(`     已刪除 ${submissionCount.length} 筆提交記錄`);
      }

      // 6. Delete participants
      if (participantCount.length > 0) {
        console.log('   清理參與者...');
        await tx.delete(participants).where(eq(participants.quizId, quizId));
        console.log(`     已刪除 ${participantCount.length} 位參與者`);
      }
    });

    console.log('\n🎉 資料清理完成！');
    console.log('\n📋 清理摘要:');
    console.log(`   Quiz: ${quiz[0].title}`);
    console.log(`   參與者: ${participantCount.length} 位 → 0 位`);
    console.log(`   提交記錄: ${submissionCount.length} 筆 → 0 筆`);
    console.log(`   分組: ${groupCount.length} 個 → 0 個`);
    console.log(`   分組執行記錄: ${groupingRunCount.length} 筆 → 0 筆`);

    console.log('\n💡 接下來可以:');
    console.log(`   1. 重新執行 npm run seed:student-responses 產生新的測試資料`);
    console.log(`   2. 使用 Admin 介面重新測試分組功能`);

  } catch (error) {
    console.error('❌ 清理過程發生錯誤:', error);
    process.exit(1);
  } finally {
    rl.close();
    await pool.end();
  }
}

// Run the cleanup script
if (require.main === module) {
  cleanupTestData();
}

export { cleanupTestData };