#!/usr/bin/env tsx

import * as dotenv from 'dotenv';
import * as readline from 'readline';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  quizzes,
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

interface TestConfig {
  name: string;
  target_group_size: number;
  include_unsubmitted: boolean;
  min_groups?: number;
  max_groups?: number;
}

interface GroupAnalysis {
  groupId: string;
  name: string;
  memberCount: number;
  averageScore: number;
  scoreRange: {
    min: number;
    max: number;
  };
  members: Array<{
    displayName: string;
    score: number;
    rank: number;
  }>;
}

interface TestResult {
  config: TestConfig;
  success: boolean;
  groupsCreated: number;
  analysis: GroupAnalysis[];
  violations: string[];
  statistics: {
    groupSizeVariance: number;
    scoreDistributionStdDev: number;
    balanceScore: number;
  };
}

// Test configurations
const TEST_CONFIGS: TestConfig[] = [
  {
    name: '小組測試 (3-4人)',
    target_group_size: 4,
    include_unsubmitted: false,
    max_groups: 8
  },
  {
    name: '中組測試 (5-6人)',
    target_group_size: 5,
    include_unsubmitted: false
  },
  {
    name: '大組測試 (7-8人)',
    target_group_size: 7,
    include_unsubmitted: true
  },
  {
    name: '包含未交卷測試',
    target_group_size: 6,
    include_unsubmitted: true,
    min_groups: 3,
    max_groups: 6
  }
];

// Mock admin session for API calls
async function callGroupingAPI(quizId: string, config: TestConfig): Promise<{
  run_id: string;
  groups_created: number;
  total_members: number;
  groups: Array<{ id: string; name: string; members_count: number }>;
}> {
  // Since we can't easily make HTTP calls from this script, we'll directly call the database operations
  // This simulates what the API does

  // Get a real admin ID for the foreign key constraint
  const admin = await db.select({ createdBy: quizzes.createdBy }).from(quizzes).where(eq(quizzes.id, quizId)).limit(1);
  const adminId = admin[0]?.createdBy;

  if (!adminId) {
    throw new Error('無法找到測驗的建立者');
  }

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

  if (allParticipants.length === 0) {
    throw new Error('此測驗沒有參與者，無法建立分組');
  }

  // Get submission data
  const submissionData = await db
    .select({
      participant_id: submissions.participantId,
      total_score: submissions.totalScore,
      submitted_at: submissions.submittedAt,
    })
    .from(submissions)
    .where(eq(submissions.quizId, quizId));

  const submissionMap = new Map(
    submissionData.map(s => [s.participant_id, s])
  );

  // Separate submitted and unsubmitted participants
  const submittedParticipants = allParticipants
    .filter(p => submissionMap.has(p.id))
    .map(p => ({
      ...p,
      submission: submissionMap.get(p.id)!,
    }))
    .sort((a, b) => {
      // Sort by total_score DESC, then by submitted_at ASC for tie-breaking
      const scoreA = parseFloat(a.submission.total_score);
      const scoreB = parseFloat(b.submission.total_score);

      if (scoreA !== scoreB) {
        return scoreB - scoreA; // Higher score first
      }

      return new Date(a.submission.submitted_at).getTime() -
             new Date(b.submission.submitted_at).getTime();
    });

  const unsubmittedParticipants = allParticipants
    .filter(p => !submissionMap.has(p.id))
    .sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

  // Determine which participants to include
  const participantsToGroup = config.include_unsubmitted
    ? [...submittedParticipants, ...unsubmittedParticipants]
    : submittedParticipants;

  if (participantsToGroup.length === 0) {
    throw new Error('沒有符合條件的參與者可以分組');
  }

  // Calculate number of groups
  let numGroups = Math.ceil(participantsToGroup.length / config.target_group_size);

  if (config.min_groups && numGroups < config.min_groups) {
    numGroups = config.min_groups;
  }

  if (config.max_groups && numGroups > config.max_groups) {
    numGroups = config.max_groups;
  }

  // Perform snake distribution
  const distributedGroups = snakeDistribute(participantsToGroup, numGroups);

  // Archive any existing active runs and create groups

  // Clean up ALL existing groups for this quiz to avoid constraint conflicts
  const allExistingGroups = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.quizId, quizId));

  // Delete group members first
  for (const group of allExistingGroups) {
    await db.delete(groupMembers).where(eq(groupMembers.groupId, group.id));
  }

  // Delete all groups for this quiz
  await db.delete(groups).where(eq(groups.quizId, quizId));

  // Archive existing runs
  await db
    .update(groupingRuns)
    .set({ status: 'archived' })
    .where(and(
      eq(groupingRuns.quizId, quizId),
      eq(groupingRuns.status, 'active')
    ));

  // Create new grouping run
  const newRun = await db
    .insert(groupingRuns)
    .values({
      quizId,
      createdBy: adminId,
      strategy: 'snake_by_score',
      config: {
        target_group_size: config.target_group_size,
        include_unsubmitted: config.include_unsubmitted,
        min_groups: config.min_groups || numGroups,
        max_groups: config.max_groups || numGroups,
        sort_by: 'total_score',
      },
      status: 'active',
    })
    .returning();

  const runId = newRun[0].id;

  // Create groups and members
  const groupsCreated = [];

  for (let i = 0; i < distributedGroups.length; i++) {
    const groupParticipants = distributedGroups[i];

    if (groupParticipants.length === 0) continue;

    // Create group
    const newGroup = await db
      .insert(groups)
      .values({
        quizId,
        groupingRunId: runId,
        name: `測試第 ${i + 1} 組`,
        orderIndex: i + 1,
      })
      .returning();

    const groupId = newGroup[0].id;

    // Add members to group
    const membersData = groupParticipants.map((participant, memberIndex) => ({
      groupId,
      participantId: participant.id,
      rankIndex: memberIndex + 1,
    }));

    await db.insert(groupMembers).values(membersData);

    groupsCreated.push({
      id: groupId,
      name: `測試第 ${i + 1} 組`,
      members_count: groupParticipants.length,
    });
  }

  return {
    run_id: runId,
    groups_created: groupsCreated.length,
    total_members: participantsToGroup.length,
    groups: groupsCreated,
  };
}

// Snake distribution algorithm (copied from API)
function snakeDistribute<T>(items: T[], numGroups: number): T[][] {
  const result: T[][] = Array(numGroups).fill(null).map(() => []);

  let currentGroup = 0;
  let direction = 1; // 1 for forward, -1 for backward

  for (const item of items) {
    result[currentGroup].push(item);

    currentGroup += direction;

    // Change direction when reaching the ends
    if (currentGroup >= numGroups) {
      currentGroup = numGroups - 1;
      direction = -1;
    } else if (currentGroup < 0) {
      currentGroup = 0;
      direction = 1;
    }
  }

  return result;
}

// Analyze groups after creation
async function analyzeGroups(quizId: string): Promise<GroupAnalysis[]> {
  // Get current active groups
  const activeGroups = await db
    .select({
      id: groups.id,
      name: groups.name,
      order_index: groups.orderIndex,
    })
    .from(groups)
    .innerJoin(groupingRuns, eq(groups.groupingRunId, groupingRuns.id))
    .where(and(
      eq(groups.quizId, quizId),
      eq(groupingRuns.status, 'active')
    ))
    .orderBy(groups.orderIndex);

  const analysis: GroupAnalysis[] = [];

  for (const group of activeGroups) {
    // Get group members with their scores
    const members = await db
      .select({
        participant_id: participants.id,
        display_name: participants.displayName,
        student_no: participants.studentNo,
        total_score: submissions.totalScore,
        rank_index: groupMembers.rankIndex,
      })
      .from(groupMembers)
      .innerJoin(participants, eq(groupMembers.participantId, participants.id))
      .leftJoin(submissions, eq(participants.id, submissions.participantId))
      .where(eq(groupMembers.groupId, group.id))
      .orderBy(groupMembers.rankIndex);

    const memberScores = members.map(m =>
      m.total_score ? parseFloat(m.total_score) : 0
    );

    const averageScore = memberScores.length > 0
      ? memberScores.reduce((sum, score) => sum + score, 0) / memberScores.length
      : 0;

    analysis.push({
      groupId: group.id,
      name: group.name,
      memberCount: members.length,
      averageScore,
      scoreRange: {
        min: Math.min(...memberScores),
        max: Math.max(...memberScores)
      },
      members: members.map((m, index) => ({
        displayName: m.display_name,
        score: m.total_score ? parseFloat(m.total_score) : 0,
        rank: index + 1
      }))
    });
  }

  return analysis;
}

// Validate grouping results
function validateGrouping(analysis: GroupAnalysis[]): {
  success: boolean;
  violations: string[];
  statistics: {
    groupSizeVariance: number;
    scoreDistributionStdDev: number;
    balanceScore: number;
  };
} {
  const violations: string[] = [];

  // Check group size constraints
  const groupSizes = analysis.map(g => g.memberCount);
  const minSize = Math.min(...groupSizes);
  const maxSize = Math.max(...groupSizes);
  const sizeVariance = maxSize - minSize;

  if (sizeVariance > 1) {
    violations.push(`組別人數不平衡: 最小${minSize}人，最大${maxSize}人 (差距${sizeVariance})`);
  }

  // Check score distribution
  const groupAverages = analysis.map(g => g.averageScore);
  const avgScore = groupAverages.reduce((sum, avg) => sum + avg, 0) / groupAverages.length;
  const scoreVariance = groupAverages.reduce((sum, avg) => sum + Math.pow(avg - avgScore, 2), 0) / groupAverages.length;
  const scoreStdDev = Math.sqrt(scoreVariance);

  // Allow up to 20% standard deviation in group average scores
  const maxAllowedStdDev = avgScore * 0.20;
  if (scoreStdDev > maxAllowedStdDev) {
    violations.push(`組間分數分布不均: 標準差${scoreStdDev.toFixed(2)} > 允許值${maxAllowedStdDev.toFixed(2)}`);
  }

  // Calculate balance score (0-100, higher is better)
  const sizeBalance = Math.max(0, 100 - (sizeVariance * 25)); // Size variance penalty
  const scoreBalance = Math.max(0, 100 - ((scoreStdDev / avgScore) * 100)); // Score distribution penalty
  const balanceScore = (sizeBalance + scoreBalance) / 2;

  return {
    success: violations.length === 0,
    violations,
    statistics: {
      groupSizeVariance: sizeVariance,
      scoreDistributionStdDev: scoreStdDev,
      balanceScore: Math.round(balanceScore)
    }
  };
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

    rl.question('請輸入要測試的 Quiz ID: ', (quizId) => {
      resolve(quizId.trim());
    });
  });
}

async function testGrouping() {
  console.log('🧪 自動化分組演算法測試');
  console.log('此腳本將測試不同分組配置並驗證結果的平衡性\n');

  try {
    // Get Quiz ID
    const quizId = await promptQuizId();
    rl.close();

    if (!quizId) {
      console.log('❌ Quiz ID 不能為空');
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
      return;
    }

    console.log(`✅ 找到 Quiz: ${quiz[0].title}`);

    // Check participants
    const participantCount = await db
      .select({ count: participants.id })
      .from(participants)
      .where(eq(participants.quizId, quizId));

    console.log(`👥 參與者數量: ${participantCount.length} 位`);

    if (participantCount.length === 0) {
      console.log('❌ 此 Quiz 沒有參與者，請先執行 seed-student-responses 腳本');
      return;
    }

    console.log('\n🚀 開始測試分組演算法...\n');

    const allResults: TestResult[] = [];

    // Run tests for each configuration
    for (const [index, config] of TEST_CONFIGS.entries()) {
      console.log(`📋 測試 ${index + 1}/${TEST_CONFIGS.length}: ${config.name}`);
      console.log(`   配置: ${config.target_group_size}人/組, ${config.include_unsubmitted ? '包含' : '不包含'}未交卷者`);

      try {
        // Call grouping API
        const apiResult = await callGroupingAPI(quizId, config);
        console.log(`   ✅ 成功建立 ${apiResult.groups_created} 個組別`);

        // Analyze results
        const analysis = await analyzeGroups(quizId);
        const validation = validateGrouping(analysis);

        const testResult: TestResult = {
          config,
          success: validation.success,
          groupsCreated: apiResult.groups_created,
          analysis,
          violations: validation.violations,
          statistics: validation.statistics
        };

        allResults.push(testResult);

        // Display results
        console.log(`   📊 平衡分數: ${validation.statistics.balanceScore}/100`);
        if (validation.success) {
          console.log(`   ✅ 測試通過`);
        } else {
          console.log(`   ❌ 測試失敗:`);
          validation.violations.forEach(violation => {
            console.log(`      - ${violation}`);
          });
        }

        // Display group summary
        console.log(`   組別摘要:`);
        analysis.forEach((group, i) => {
          console.log(`      第${i+1}組: ${group.memberCount}人, 平均分數: ${group.averageScore.toFixed(1)}`);
        });

        console.log('');

      } catch (error) {
        console.log(`   ❌ 測試失敗: ${error}`);
        console.log('');
      }
    }

    // Generate summary report
    console.log('📈 測試結果總覽');
    console.log('=' .repeat(50));

    const passedTests = allResults.filter(r => r.success);
    const failedTests = allResults.filter(r => !r.success);

    console.log(`✅ 通過測試: ${passedTests.length}/${allResults.length}`);
    console.log(`❌ 失敗測試: ${failedTests.length}/${allResults.length}`);

    if (allResults.length > 0) {
      const avgBalance = allResults.reduce((sum, r) => sum + r.statistics.balanceScore, 0) / allResults.length;
      console.log(`📊 平均平衡分數: ${avgBalance.toFixed(1)}/100`);
    }

    // Detailed results
    console.log('\n📋 詳細測試結果:');
    allResults.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.config.name}`);
      console.log(`   狀態: ${result.success ? '✅ 通過' : '❌ 失敗'}`);
      console.log(`   組數: ${result.groupsCreated}`);
      console.log(`   平衡分數: ${result.statistics.balanceScore}/100`);
      console.log(`   組別人數差異: ${result.statistics.groupSizeVariance}`);
      console.log(`   分數標準差: ${result.statistics.scoreDistributionStdDev.toFixed(2)}`);

      if (result.violations.length > 0) {
        console.log(`   問題:`);
        result.violations.forEach(violation => {
          console.log(`      - ${violation}`);
        });
      }
    });

    // Recommendations
    console.log('\n💡 建議:');
    if (passedTests.length === allResults.length) {
      console.log('   🎉 所有測試都通過！分組演算法運作正常。');
    } else {
      console.log('   ⚠️  部分測試失敗，建議檢查:');
      console.log('      - 參與者數量是否足夠支援所有測試配置');
      console.log('      - 分數分布是否過於集中或分散');
      console.log('      - 是否需要調整分組算法參數');
    }

  } catch (error) {
    console.error('❌ 測試過程發生錯誤:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the test script
if (require.main === module) {
  testGrouping();
}

export { testGrouping };