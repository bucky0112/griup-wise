#!/usr/bin/env tsx

import * as dotenv from 'dotenv';
import * as readline from 'readline';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { quizzes, questions, participants, submissions, answers } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';
import { calculateScore } from '../src/lib/scoring';

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

// Performance tiers for realistic scoring
type PerformanceTier = 'high' | 'medium' | 'low' | 'struggler';

interface StudentProfile {
  displayName: string;
  studentNo: string;
  tier: PerformanceTier;
  correctnessRate: number;
}

// Generate diverse student profiles
function generateStudentProfiles(): StudentProfile[] {
  const firstNames = [
    '小明', '小華', '小美', '小強', '小雯', '小傑', '小玲', '小芳',
    '大雄', '靜香', '胖虎', '小夫', '多啦A夢', '小丸子', '花輪', '永澤',
    '阿Ken', '阿May', '阿Jack', '阿Rose', '阿Tom', '阿Amy', '阿Ben', '阿Sue',
    '志明', '春嬌', '阿信', '小敏', '建國', '美麗'
  ];

  const lastNames = ['王', '李', '張', '劉', '陳', '楊', '趙', '黃', '周', '吳', '徐', '孫', '胡', '朱', '高', '林'];

  const profiles: StudentProfile[] = [];

  // Performance tier distribution
  const tierConfig = [
    { tier: 'high' as PerformanceTier, count: 7, rate: 0.9 },      // 85-100% correct
    { tier: 'medium' as PerformanceTier, count: 9, rate: 0.75 },   // 65-84% correct
    { tier: 'low' as PerformanceTier, count: 7, rate: 0.55 },      // 45-64% correct
    { tier: 'struggler' as PerformanceTier, count: 4, rate: 0.3 }  // 0-44% correct
  ];

  let studentIdCounter = 1;

  for (const config of tierConfig) {
    for (let i = 0; i < config.count; i++) {
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
      const displayName = `${lastName}${firstName}`;

      // Generate unique student number
      const studentNo = `D${String(studentIdCounter).padStart(8, '0')}`;
      studentIdCounter++;

      // Add some randomness to correctness rate
      const baseRate = config.rate;
      const variance = 0.1; // ±10% variance
      const correctnessRate = Math.max(0, Math.min(1,
        baseRate + (Math.random() - 0.5) * 2 * variance
      ));

      profiles.push({
        displayName,
        studentNo,
        tier: config.tier,
        correctnessRate
      });
    }
  }

  // Shuffle array for realistic distribution
  return profiles.sort(() => Math.random() - 0.5);
}

// Generate realistic answer for a question based on performance tier
function generateAnswer(question: { type: string; answerKey: unknown; options?: unknown }, profile: StudentProfile): unknown {
  const isCorrect = Math.random() < profile.correctnessRate;

  if (isCorrect) {
    // Return correct answer (normalized to first element if array)
    const correctAnswer = question.answerKey;
    if (Array.isArray(correctAnswer)) {
      return question.type === 'multiple' ? correctAnswer : correctAnswer[0];
    }
    return correctAnswer;
  } else {
    // Generate realistic incorrect answer based on question type
    return generateIncorrectAnswer(question);
  }
}

function generateIncorrectAnswer(question: { type: string; answerKey: unknown; options?: unknown }): unknown {
  switch (question.type) {
    case 'single':
      if (question.options && Array.isArray(question.options)) {
        const correctAnswer = Array.isArray(question.answerKey) ? question.answerKey[0] : question.answerKey;
        const incorrectOptions = question.options.filter((opt: unknown) => opt !== correctAnswer);
        return incorrectOptions[Math.floor(Math.random() * incorrectOptions.length)] || question.options[0];
      }
      return 'incorrect_answer';

    case 'boolean':
      const correctAnswer = Array.isArray(question.answerKey) ? question.answerKey[0] : question.answerKey;
      return !correctAnswer;

    case 'multiple':
      if (question.options && Array.isArray(question.options)) {
        const correctAnswers = Array.isArray(question.answerKey) ? question.answerKey : [question.answerKey];
        const incorrectOptions = question.options.filter((opt: unknown) => !correctAnswers.includes(opt));
        // Return random subset of incorrect options
        const numIncorrect = Math.floor(Math.random() * incorrectOptions.length) + 1;
        return incorrectOptions.slice(0, numIncorrect);
      }
      return [];

    case 'short_text':
      const wrongAnswers = ['wrong', 'incorrect', 'not sure', '不知道', '錯誤答案'];
      return wrongAnswers[Math.floor(Math.random() * wrongAnswers.length)];

    case 'numeric':
      const correctNum = Array.isArray(question.answerKey) ? question.answerKey[0] : question.answerKey;
      // Generate number within reasonable range but incorrect
      const variation = Math.floor(Math.random() * 10) + 1;
      return Math.random() > 0.5 ? correctNum + variation : correctNum - variation;

    default:
      return null;
  }
}

// Prompt for Quiz ID
function promptQuizId(): Promise<string> {
  return new Promise((resolve) => {
    const envQuizId = process.env.QUIZ_ID;
    if (envQuizId) {
      console.log(`Using Quiz ID from environment: ${envQuizId}`);
      resolve(envQuizId);
      return;
    }

    rl.question('請輸入要產生學生資料的 Quiz ID: ', (quizId) => {
      resolve(quizId.trim());
    });
  });
}

async function seedStudentResponses() {
  console.log('🌱 學生答題資料產生器');
  console.log('此腳本將產生 25-30 位虛擬學生的答題資料，包含不同程度的表現等級\n');

  try {
    // Get Quiz ID
    const quizId = await promptQuizId();
    rl.close();

    if (!quizId) {
      console.log('❌ Quiz ID 不能為空');
      return;
    }

    // Verify quiz exists and get questions
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
      return;
    }

    console.log(`✅ 找到 Quiz: ${quiz[0].title}`);

    // Get all questions for this quiz
    const quizQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.quizId, quizId))
      .orderBy(questions.orderIndex);

    if (quizQuestions.length === 0) {
      console.log('❌ 此 Quiz 沒有題目，無法產生答題資料');
      return;
    }

    console.log(`📝 Quiz 有 ${quizQuestions.length} 道題目`);

    // Check if participants already exist
    const existingParticipants = await db
      .select({ count: participants.id })
      .from(participants)
      .where(eq(participants.quizId, quizId));

    if (existingParticipants.length > 0) {
      console.log(`⚠️  警告: 此 Quiz 已有 ${existingParticipants.length} 位參與者`);
      console.log('此腳本將新增更多學生資料');
    }

    // Generate student profiles
    const studentProfiles = generateStudentProfiles();
    console.log(`\n👥 將產生 ${studentProfiles.length} 位學生的答題資料:`);

    // Display distribution
    const distribution = studentProfiles.reduce((acc, profile) => {
      acc[profile.tier] = (acc[profile.tier] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log(`   高分群 (85-100%): ${distribution.high || 0} 位`);
    console.log(`   中等群 (65-84%): ${distribution.medium || 0} 位`);
    console.log(`   低分群 (45-64%): ${distribution.low || 0} 位`);
    console.log(`   待加強 (0-44%): ${distribution.struggler || 0} 位`);

    console.log('\n🚀 開始產生資料...');

    // Process each student
    for (const [index, profile] of studentProfiles.entries()) {
      console.log(`\n処理學生 ${index + 1}/${studentProfiles.length}: ${profile.displayName} (${profile.studentNo})`);

      // Create participant
      const newParticipant = await db
        .insert(participants)
        .values({
          quizId,
          displayName: profile.displayName,
          studentNo: profile.studentNo,
          uniqueKey: `${quizId}:${profile.studentNo}`,
        })
        .returning();

      const participantId = newParticipant[0].id;

      // Generate answers for each question
      const studentAnswers: Array<{
        questionId: string;
        response: unknown;
        earnedScore: string;
      }> = [];

      for (const question of quizQuestions) {
        const studentAnswer = generateAnswer(question, profile);
        const maxScore = parseFloat(question.score);
        const earnedScore = calculateScore(
          question.type,
          studentAnswer,
          question.answerKey,
          maxScore
        );

        studentAnswers.push({
          questionId: question.id,
          response: studentAnswer,
          earnedScore: earnedScore.toString()
        });
      }

      // Calculate total score
      const totalScore = studentAnswers.reduce((sum, answer) => sum + parseFloat(answer.earnedScore), 0);

      // Create submission
      const newSubmission = await db
        .insert(submissions)
        .values({
          quizId,
          participantId,
          totalScore: totalScore.toString(),
        })
        .returning();

      const submissionId = newSubmission[0].id;

      // Create answer records
      const answerRecords = studentAnswers.map(answer => ({
        submissionId,
        questionId: answer.questionId,
        response: answer.response,
        earnedScore: answer.earnedScore
      }));

      await db.insert(answers).values(answerRecords);

      console.log(`   總分: ${totalScore.toFixed(1)} (正確率: ${(profile.correctnessRate * 100).toFixed(1)}%)`);
    }

    // Generate summary statistics
    const allSubmissions = await db
      .select({ totalScore: submissions.totalScore })
      .from(submissions)
      .where(eq(submissions.quizId, quizId));

    const scores = allSubmissions.map(s => parseFloat(s.totalScore));
    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const maxPossible = quizQuestions.reduce((sum, q) => sum + parseFloat(q.score), 0);

    console.log('\n🎉 學生答題資料產生完成！');
    console.log('\n📊 統計摘要:');
    console.log(`   總參與者: ${scores.length} 位`);
    console.log(`   平均分數: ${avgScore.toFixed(2)} / ${maxPossible}`);
    console.log(`   平均正確率: ${((avgScore / maxPossible) * 100).toFixed(1)}%`);
    console.log(`   分數範圍: ${Math.min(...scores).toFixed(1)} - ${Math.max(...scores).toFixed(1)}`);

    console.log('\n💡 接下來可以:');
    console.log(`   1. 使用 Admin 介面測試自動分組功能`);
    console.log(`   2. 執行 npm run test:grouping -- --quiz-id=${quizId} 進行自動化測試`);
    console.log(`   3. 使用 npm run group:stats -- --quiz-id=${quizId} 查看分組統計`);

  } catch (error) {
    console.error('❌ 錯誤:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the seeding script
if (require.main === module) {
  seedStudentResponses();
}

export { seedStudentResponses };