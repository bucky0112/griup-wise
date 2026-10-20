import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import {
  quizzes,
  participants,
  submissions,
  groupingRuns,
  groups,
  groupMembers
} from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { lockQuizForGrouping } from '@/lib/grouping/quiz-lock';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const regenerateGroupsSchema = z.object({
  target_group_size: z.number().min(1).max(50),
  include_unsubmitted: z.boolean(),
  min_groups: z.number().min(1).optional(),
  max_groups: z.number().min(1).optional(),
  strategy: z.literal('snake_by_score'),
});

// Helper function to calculate optimal group sizes
function calculateOptimalGrouping(participantCount: number, targetSize: number, minGroups?: number, maxGroups?: number): {
  groupCount: number;
  groupSizes: number[];
} {
  if (participantCount === 0) {
    return { groupCount: 0, groupSizes: [] };
  }

  const candidates = [];

  // Set a reasonable maximum group size to prevent oversized groups
  // Allow at most targetSize + 1 to handle small remainders
  const maxGroupSize = targetSize + 1;

  // Test different group counts within reasonable range
  const minGroupCount = minGroups || Math.max(1, Math.ceil(participantCount / maxGroupSize));
  const maxGroupCount = maxGroups || Math.ceil(participantCount / 2);

  for (let groups = minGroupCount; groups <= maxGroupCount; groups++) {
    const baseSize = Math.floor(participantCount / groups);
    const remainder = participantCount % groups;

    // Calculate distribution - larger groups first
    const groupSizes = Array(groups).fill(baseSize);
    for (let i = 0; i < remainder; i++) {
      groupSizes[i]++;
    }

    // Skip configurations where any group exceeds the maximum group size
    const maxActualSize = Math.max(...groupSizes);
    if (maxActualSize > maxGroupSize) {
      continue;
    }

    // Calculate deviations from target
    const deviations = groupSizes.map(size => Math.abs(size - targetSize));
    const maxDeviation = Math.max(...deviations);
    const avgDeviation = deviations.reduce((sum, dev) => sum + dev, 0) / groups;

    // Enhanced scoring: heavily penalize oversized groups
    let score = maxDeviation * 10 + avgDeviation;

    // Additional penalty for groups that exceed target size significantly
    for (const size of groupSizes) {
      if (size > targetSize) {
        const excessPenalty = Math.pow(size - targetSize, 2) * 100;
        score += excessPenalty;
      }
    }

    candidates.push({
      groupCount: groups,
      groupSizes,
      maxDeviation,
      avgDeviation,
      score
    });
  }

  // Add the simple ceil calculation as a fallback (with size limits)
  const simpleGroups = Math.ceil(participantCount / targetSize);
  if ((!minGroups || simpleGroups >= minGroups) && (!maxGroups || simpleGroups <= maxGroups)) {
    const baseSize = Math.floor(participantCount / simpleGroups);
    const remainder = participantCount % simpleGroups;

    const groupSizes = Array(simpleGroups).fill(baseSize);
    for (let i = 0; i < remainder; i++) {
      groupSizes[i]++;
    }

    // Only add if no groups exceed the maximum size
    const maxActualSize = Math.max(...groupSizes);
    if (maxActualSize <= maxGroupSize) {
      const deviations = groupSizes.map(size => Math.abs(size - targetSize));
      const maxDeviation = Math.max(...deviations);
      const avgDeviation = deviations.reduce((sum, dev) => sum + dev, 0) / simpleGroups;
      let score = maxDeviation * 10 + avgDeviation;

      // Apply same excess penalty
      for (const size of groupSizes) {
        if (size > targetSize) {
          const excessPenalty = Math.pow(size - targetSize, 2) * 100;
          score += excessPenalty;
        }
      }

      candidates.push({
        groupCount: simpleGroups,
        groupSizes,
        maxDeviation,
        avgDeviation,
        score
      });
    }
  }

  // If no valid candidates (shouldn't happen with reasonable inputs), fall back to single group
  if (candidates.length === 0) {
    return {
      groupCount: 1,
      groupSizes: [participantCount]
    };
  }

  // Find best candidate (lowest score)
  candidates.sort((a, b) => a.score - b.score);
  const best = candidates[0];

  return {
    groupCount: best.groupCount,
    groupSizes: best.groupSizes
  };
}

// Helper function to perform snake distribution with predetermined group sizes
function snakeDistributeWithSizes<T>(items: T[], groupSizes: number[]): T[][] {
  const groupCount = groupSizes.length;
  const result: T[][] = Array(groupCount).fill(null).map(() => []);

  let itemIndex = 0;
  let round = 0;

  while (itemIndex < items.length) {
    // Determine direction for this round (snake pattern)
    const isForward = round % 2 === 0;
    const groupOrder = isForward
      ? Array.from({ length: groupCount }, (_, i) => i)
      : Array.from({ length: groupCount }, (_, i) => groupCount - 1 - i);

    // Assign one item to each group that still has capacity
    for (const groupIndex of groupOrder) {
      if (itemIndex >= items.length) break;
      if (result[groupIndex].length < groupSizes[groupIndex]) {
        result[groupIndex].push(items[itemIndex]);
        itemIndex++;
      }
    }
    round++;
  }

  return result;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: quizId } = await params;
  try {
    const session = await getSession();

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }


    // Verify quiz exists and is owned by this admin
    const quiz = await db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        created_by: quizzes.createdBy,
      })
      .from(quizzes)
      .where(and(eq(quizzes.id, quizId), isNull(quizzes.deletedAt)))
      .limit(1);

    if (quiz.length === 0) {
      return NextResponse.json(
        { message: '測驗不存在' },
        { status: 404 }
      );
    }

    if (quiz[0].created_by !== session.id) {
      return NextResponse.json(
        { message: '無權限管理此測驗' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const config = regenerateGroupsSchema.parse(body);

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
      return NextResponse.json(
        { message: '此測驗沒有參與者，無法建立分組' },
        { status: 400 }
      );
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

        // Tie-breaking by submitted_at ASC
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
      return NextResponse.json(
        { message: '沒有符合條件的參與者可以分組' },
        { status: 400 }
      );
    }

    // Calculate optimal grouping
    const { groupCount, groupSizes } = calculateOptimalGrouping(
      participantsToGroup.length,
      config.target_group_size,
      config.min_groups,
      config.max_groups
    );

    // Perform snake distribution with optimal group sizes
    const distributedGroups = snakeDistributeWithSizes(participantsToGroup, groupSizes);

    // Use transaction to ensure data consistency
    const result = await db.transaction(async (tx) => {
      await lockQuizForGrouping(tx, quizId);

      // Get existing active groups to delete
      const existingGroups = await tx
        .select({ id: groups.id })
        .from(groups)
        .leftJoin(groupingRuns, eq(groups.groupingRunId, groupingRuns.id))
        .where(and(
          eq(groupingRuns.quizId, quizId),
          eq(groupingRuns.status, 'active')
        ));

      // Delete existing group members and groups (due to foreign key constraint)
      if (existingGroups.length > 0) {
        const groupIds = existingGroups.map(g => g.id);

        // Delete all group members for existing groups
        for (const groupId of groupIds) {
          await tx
            .delete(groupMembers)
            .where(eq(groupMembers.groupId, groupId));
        }

        // Delete all existing groups
        for (const groupId of groupIds) {
          await tx
            .delete(groups)
            .where(eq(groups.id, groupId));
        }
      }

      // Archive any existing active runs
      await tx
        .update(groupingRuns)
        .set({ status: 'archived' })
        .where(and(
          eq(groupingRuns.quizId, quizId),
          eq(groupingRuns.status, 'active')
        ));

      // Create new grouping run
      const newRun = await tx
        .insert(groupingRuns)
        .values({
          quizId,
          createdBy: session.id,
          strategy: config.strategy,
          config: {
            target_group_size: config.target_group_size,
            include_unsubmitted: config.include_unsubmitted,
            min_groups: config.min_groups || groupCount,
            max_groups: config.max_groups || groupCount,
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

        if (groupParticipants.length === 0) continue; // Skip empty groups

        // Create group
        const newGroup = await tx
          .insert(groups)
          .values({
            quizId,
            groupingRunId: runId,
            name: `第 ${i + 1} 組`,
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

        await tx.insert(groupMembers).values(membersData);

        groupsCreated.push({
          id: groupId,
          name: `第 ${i + 1} 組`,
          members_count: groupParticipants.length,
        });
      }

      return {
        run_id: runId,
        groups_created: groupsCreated.length,
        total_members: participantsToGroup.length,
        groups: groupsCreated,
      };
    });

    return NextResponse.json({
      message: '分組重新建立成功',
      run_id: result.run_id,
      groups_created: result.groups_created,
      total_members: result.total_members,
      config_used: {
        target_group_size: config.target_group_size,
        final_groups_count: result.groups_created,
        include_unsubmitted: config.include_unsubmitted,
      },
    });

  } catch (error) {
    console.error('Error regenerating groups:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          message: '分組設定格式錯誤',
          errors: error.issues.map(e => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: '重新建立分組失敗，請稍後再試' },
      { status: 500 }
    );
  }
}