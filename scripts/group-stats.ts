#!/usr/bin/env tsx

import * as dotenv from 'dotenv';
import * as readline from 'readline';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  quizzes,
  questions,
  participants,
  submissions,
  groups,
  groupMembers,
  groupingRuns
} from '../src/lib/db/schema';
import { eq, and } from 'drizzle-orm';

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

interface GroupStats {
  groupId: string;
  groupName: string;
  orderIndex: number;
  memberCount: number;
  averageScore: number;
  scoreRange: {
    min: number;
    max: number;
  };
  members: Array<{
    displayName: string;
    studentNo: string;
    score: number;
    rank: number;
    submitted: boolean;
  }>;
}

interface OverallStats {
  totalParticipants: number;
  submittedCount: number;
  groupCount: number;
  averageGroupSize: number;
  scoreStats: {
    mean: number;
    median: number;
    min: number;
    max: number;
    stdDev: number;
  };
  groupBalanceScore: number;
}

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

    rl.question('請輸入要查看統計的 Quiz ID: ', (quizId) => {
      resolve(quizId.trim());
    });
  });
}

// Calculate statistics from scores
function calculateScoreStats(scores: number[]) {
  if (scores.length === 0) {
    return {
      mean: 0,
      median: 0,
      min: 0,
      max: 0,
      stdDev: 0,
    };
  }

  const sortedScores = [...scores].sort((a, b) => a - b);
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;

  const median = sortedScores.length % 2 === 0
    ? (sortedScores[sortedScores.length / 2 - 1] + sortedScores[sortedScores.length / 2]) / 2
    : sortedScores[Math.floor(sortedScores.length / 2)];

  const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  return {
    mean: Number(mean.toFixed(2)),
    median: Number(median.toFixed(2)),
    min: sortedScores[0],
    max: sortedScores[sortedScores.length - 1],
    stdDev: Number(stdDev.toFixed(2)),
  };
}

// Calculate group balance score
function calculateGroupBalance(groupStats: GroupStats[]): number {
  if (groupStats.length === 0) return 0;

  // Size balance (variance in group sizes)
  const groupSizes = groupStats.map(g => g.memberCount);
  const minSize = Math.min(...groupSizes);
  const maxSize = Math.max(...groupSizes);
  const sizeVariance = maxSize - minSize;
  const sizeBalance = Math.max(0, 100 - (sizeVariance * 25));

  // Score balance (variance in group average scores)
  const groupAverages = groupStats.map(g => g.averageScore);
  const avgScore = groupAverages.reduce((sum, avg) => sum + avg, 0) / groupAverages.length;
  const scoreVariance = groupAverages.reduce((sum, avg) => sum + Math.pow(avg - avgScore, 2), 0) / groupAverages.length;
  const scoreStdDev = Math.sqrt(scoreVariance);
  const scoreBalance = Math.max(0, 100 - ((scoreStdDev / avgScore) * 100));

  return Math.round((sizeBalance + scoreBalance) / 2);
}

// Print table with proper formatting
function printTable(headers: string[], rows: string[][], columnWidths?: number[]) {
  // Calculate column widths if not provided
  if (!columnWidths) {
    columnWidths = headers.map((header, i) => {
      const maxContentLength = Math.max(
        header.length,
        ...rows.map(row => (row[i] || '').length)
      );
      return Math.max(8, maxContentLength + 2); // Minimum 8 chars, plus padding
    });
  }

  // Print separator
  const separator = '─'.repeat(columnWidths.reduce((sum, width) => sum + width + 1, 1));

  // Print header
  const headerRow = '│' + headers.map((header, i) =>
    ` ${header.padEnd(columnWidths![i] - 1)}`
  ).join('│') + '│';

  console.log(separator);
  console.log(headerRow);
  console.log(separator);

  // Print rows
  rows.forEach(row => {
    const dataRow = '│' + row.map((cell, i) =>
      ` ${(cell || '').padEnd(columnWidths![i] - 1)}`
    ).join('│') + '│';
    console.log(dataRow);
  });

  console.log(separator);
}

async function showGroupStats() {
  console.log('📊 分組統計報告');
  console.log('顯示指定 Quiz 的詳細分組資訊和統計數據\n');

  try {
    // Get Quiz ID
    const quizId = await promptQuizId();
    rl.close();

    if (!quizId) {
      console.log('❌ Quiz ID 不能為空');
      return;
    }

    // Verify quiz exists and get basic info
    console.log(`🔍 查詢 Quiz ID: ${quizId}`);
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

    console.log(`✅ Quiz: ${quiz[0].title}\n`);

    // Get total possible score
    const quizQuestions = await db
      .select({ score: questions.score })
      .from(questions)
      .where(eq(questions.quizId, quizId));

    const maxPossibleScore = quizQuestions.reduce((sum, q) => sum + parseFloat(q.score), 0);

    // Get all participants
    const allParticipants = await db
      .select({
        id: participants.id,
        display_name: participants.displayName,
        student_no: participants.studentNo,
        created_at: participants.createdAt,
      })
      .from(participants)
      .where(eq(participants.quizId, quizId));

    // Get all submissions
    const allSubmissions = await db
      .select({
        participant_id: submissions.participantId,
        total_score: submissions.totalScore,
        submitted_at: submissions.submittedAt,
      })
      .from(submissions)
      .where(eq(submissions.quizId, quizId));

    const submissionMap = new Map(
      allSubmissions.map(s => [s.participant_id, s])
    );

    // Check if there are any active groups
    const activeGroupingRun = await db
      .select({
        id: groupingRuns.id,
        created_at: groupingRuns.createdAt,
        strategy: groupingRuns.strategy,
        config: groupingRuns.config,
      })
      .from(groupingRuns)
      .where(and(
        eq(groupingRuns.quizId, quizId),
        eq(groupingRuns.status, 'active')
      ))
      .limit(1);

    console.log('📋 基本資訊');
    console.log('─'.repeat(50));
    console.log(`總參與者: ${allParticipants.length} 位`);
    console.log(`已提交: ${allSubmissions.length} 位`);
    console.log(`未提交: ${allParticipants.length - allSubmissions.length} 位`);
    console.log(`滿分: ${maxPossibleScore} 分`);

    if (activeGroupingRun.length === 0) {
      console.log(`分組狀態: ❌ 尚未分組`);

      if (allParticipants.length === 0) {
        console.log('\n💡 建議: 先執行 npm run seed:student-responses 產生測試資料');
      } else {
        console.log('\n💡 建議: 使用 Admin 介面或 API 建立分組');
      }
      return;
    }

    const groupingConfig = activeGroupingRun[0].config as { target_group_size?: number };
    console.log(`分組狀態: ✅ 已分組 (${activeGroupingRun[0].strategy})`);
    console.log(`分組時間: ${new Date(activeGroupingRun[0].created_at).toLocaleString('zh-TW')}`);
    console.log(`目標人數: ${groupingConfig.target_group_size} 人/組`);

    // Get current groups with members
    const activeGroups = await db
      .select({
        id: groups.id,
        name: groups.name,
        order_index: groups.orderIndex,
      })
      .from(groups)
      .where(eq(groups.groupingRunId, activeGroupingRun[0].id))
      .orderBy(groups.orderIndex);

    if (activeGroups.length === 0) {
      console.log('\n❌ 找不到分組資料');
      return;
    }

    // Collect detailed group stats
    const groupStats: GroupStats[] = [];
    const allScores: number[] = [];

    for (const group of activeGroups) {
      // Get group members
      const members = await db
        .select({
          participant_id: participants.id,
          display_name: participants.displayName,
          student_no: participants.studentNo,
          rank_index: groupMembers.rankIndex,
        })
        .from(groupMembers)
        .innerJoin(participants, eq(groupMembers.participantId, participants.id))
        .where(eq(groupMembers.groupId, group.id))
        .orderBy(groupMembers.rankIndex);

      const memberData = members.map(member => {
        const submission = submissionMap.get(member.participant_id);
        const score = submission ? parseFloat(submission.total_score) : 0;

        if (submission) allScores.push(score);

        return {
          displayName: member.display_name,
          studentNo: member.student_no,
          score,
          rank: member.rank_index,
          submitted: !!submission,
        };
      });

      const memberScores = memberData
        .filter(m => m.submitted)
        .map(m => m.score);

      const averageScore = memberScores.length > 0
        ? memberScores.reduce((sum, score) => sum + score, 0) / memberScores.length
        : 0;

      groupStats.push({
        groupId: group.id,
        groupName: group.name,
        orderIndex: group.order_index,
        memberCount: members.length,
        averageScore,
        scoreRange: memberScores.length > 0 ? {
          min: Math.min(...memberScores),
          max: Math.max(...memberScores)
        } : { min: 0, max: 0 },
        members: memberData,
      });
    }

    // Calculate overall statistics
    const scoreStats = calculateScoreStats(allScores);
    const groupBalance = calculateGroupBalance(groupStats);

    const overallStats: OverallStats = {
      totalParticipants: allParticipants.length,
      submittedCount: allSubmissions.length,
      groupCount: activeGroups.length,
      averageGroupSize: allParticipants.length / activeGroups.length,
      scoreStats,
      groupBalanceScore: groupBalance,
    };

    // Display group overview table
    console.log('\n📊 分組概覽');
    console.log('─'.repeat(70));

    const groupOverviewHeaders = ['組別', '人數', '平均分', '分數範圍', '提交率'];
    const groupOverviewRows = groupStats.map(group => {
      const submittedInGroup = group.members.filter(m => m.submitted).length;
      const submissionRate = group.members.length > 0
        ? Math.round((submittedInGroup / group.members.length) * 100)
        : 0;

      return [
        group.groupName,
        group.memberCount.toString(),
        group.averageScore > 0 ? group.averageScore.toFixed(1) : 'N/A',
        group.averageScore > 0 ? `${group.scoreRange.min.toFixed(1)}-${group.scoreRange.max.toFixed(1)}` : 'N/A',
        `${submissionRate}%`
      ];
    });

    printTable(groupOverviewHeaders, groupOverviewRows);

    // Display detailed group members
    console.log('\n👥 分組詳情');
    console.log('─'.repeat(80));

    for (const group of groupStats) {
      console.log(`\n${group.groupName} (${group.memberCount}人)`);

      const memberHeaders = ['排名', '姓名', '學號', '分數', '狀態'];
      const memberRows = group.members.map(member => [
        member.rank.toString(),
        member.displayName,
        member.studentNo,
        member.submitted ? member.score.toFixed(1) : 'N/A',
        member.submitted ? '✅ 已交' : '❌ 未交'
      ]);

      printTable(memberHeaders, memberRows, [6, 12, 12, 8, 8]);
    }

    // Display overall statistics
    console.log('\n📈 整體統計');
    console.log('─'.repeat(50));
    console.log(`參與者總數: ${overallStats.totalParticipants} 位`);
    console.log(`提交人數: ${overallStats.submittedCount} 位`);
    console.log(`分組數量: ${overallStats.groupCount} 組`);
    console.log(`平均組別大小: ${overallStats.averageGroupSize.toFixed(1)} 人`);
    console.log(`分組平衡分數: ${overallStats.groupBalanceScore}/100`);

    if (overallStats.submittedCount > 0) {
      console.log('\n📊 分數統計 (僅已提交者)');
      console.log('─'.repeat(30));
      console.log(`平均分: ${overallStats.scoreStats.mean}`);
      console.log(`中位數: ${overallStats.scoreStats.median}`);
      console.log(`標準差: ${overallStats.scoreStats.stdDev}`);
      console.log(`分數範圍: ${overallStats.scoreStats.min} - ${overallStats.scoreStats.max}`);
      console.log(`平均正確率: ${((overallStats.scoreStats.mean / maxPossibleScore) * 100).toFixed(1)}%`);
    }

    // Provide recommendations
    console.log('\n💡 分析建議');
    console.log('─'.repeat(30));

    if (overallStats.groupBalanceScore >= 80) {
      console.log('✅ 分組平衡良好');
    } else if (overallStats.groupBalanceScore >= 60) {
      console.log('⚠️  分組略有不平衡，建議檢查分組參數');
    } else {
      console.log('❌ 分組不平衡，建議重新分組');
    }

    if (overallStats.submittedCount < overallStats.totalParticipants * 0.8) {
      console.log('⚠️  提交率偏低，可能影響分組效果');
    }

    const groupSizes = groupStats.map(g => g.memberCount);
    const sizeVariance = Math.max(...groupSizes) - Math.min(...groupSizes);
    if (sizeVariance > 1) {
      console.log(`⚠️  組別人數差異較大 (相差${sizeVariance}人)`);
    }

  } catch (error) {
    console.error('❌ 查詢過程發生錯誤:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the stats script
if (require.main === module) {
  showGroupStats();
}

export { showGroupStats };