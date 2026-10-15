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
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { lockQuizForGrouping } from '@/lib/grouping/quiz-lock';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const createGroupsSchema = z.object({
  target_group_size: z.number().min(1).max(50),
  include_unsubmitted: z.boolean(),
  min_groups: z.number().min(1).optional(),
  max_groups: z.number().min(1).optional(),
  strategy: z.literal('snake_by_score'),
});

// Helper function to perform snake distribution
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
      .where(eq(quizzes.id, quizId))
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
    const config = createGroupsSchema.parse(body);

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

    // Use transaction to ensure data consistency
    const result = await db.transaction(async (tx) => {
      await lockQuizForGrouping(tx, quizId);

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
      message: '分組建立成功',
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
    console.error('Error creating groups:', error);

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
      { message: '建立分組失敗，請稍後再試' },
      { status: 500 }
    );
  }
}