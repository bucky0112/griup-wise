import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import {
  groups,
  groupMembers,
  groupingRuns,
  quizzes,
  participants
} from '@/lib/db/schema';
import { eq, and, count } from 'drizzle-orm';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

const moveMemberSchema = z.object({
  participant_id: z.string().uuid(),
  new_group_id: z.string().uuid().nullable(),
});

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  try {
    const session = await getSession();

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

    // Verify group exists and admin has permission
    const groupData = await db
      .select({
        id: groups.id,
        quiz_id: groups.quizId,
        grouping_run_id: groups.groupingRunId,
        created_by: quizzes.createdBy,
      })
      .from(groups)
      .innerJoin(groupingRuns, eq(groups.groupingRunId, groupingRuns.id))
      .innerJoin(quizzes, eq(groups.quizId, quizzes.id))
      .where(eq(groups.id, groupId))
      .limit(1);

    if (groupData.length === 0) {
      return NextResponse.json(
        { message: '分組不存在' },
        { status: 404 }
      );
    }

    if (groupData[0].created_by !== session.id) {
      return NextResponse.json(
        { message: '無權限操作此分組' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { participant_id, new_group_id } = moveMemberSchema.parse(body);

    // Verify participant exists and is in the current group
    const memberData = await db
      .select({
        id: groupMembers.id,
        participant_id: groupMembers.participantId,
        rank_index: groupMembers.rankIndex,
      })
      .from(groupMembers)
      .innerJoin(participants, eq(groupMembers.participantId, participants.id))
      .where(and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.participantId, participant_id),
        eq(participants.quizId, groupData[0].quiz_id)
      ))
      .limit(1);

    if (memberData.length === 0) {
      return NextResponse.json(
        { message: '該參與者不在此組別中' },
        { status: 400 }
      );
    }

    if (new_group_id) {
      // Moving to another group
      // Verify target group exists and is in the same quiz/run
      const targetGroupData = await db
        .select({
          id: groups.id,
          quiz_id: groups.quizId,
          grouping_run_id: groups.groupingRunId,
        })
        .from(groups)
        .where(eq(groups.id, new_group_id))
        .limit(1);

      if (targetGroupData.length === 0) {
        return NextResponse.json(
          { message: '目標分組不存在' },
          { status: 400 }
        );
      }

      if (targetGroupData[0].quiz_id !== groupData[0].quiz_id ||
          targetGroupData[0].grouping_run_id !== groupData[0].grouping_run_id) {
        return NextResponse.json(
          { message: '只能在同一測驗的同一分組記錄中移動' },
          { status: 400 }
        );
      }

      // Check if participant is already in target group
      const existingMember = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(
          eq(groupMembers.groupId, new_group_id),
          eq(groupMembers.participantId, participant_id)
        ))
        .limit(1);

      if (existingMember.length > 0) {
        return NextResponse.json(
          { message: '該參與者已在目標組別中' },
          { status: 400 }
        );
      }

      // Get next rank index for target group
      const targetGroupMembersCount = await db
        .select({ count: count() })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, new_group_id));

      const nextRankIndex = (targetGroupMembersCount[0]?.count || 0) + 1;

      // Perform the move in a transaction
      await db.transaction(async (tx) => {
        // Remove from current group
        await tx
          .delete(groupMembers)
          .where(eq(groupMembers.id, memberData[0].id));

        // Add to new group
        await tx
          .insert(groupMembers)
          .values({
            groupId: new_group_id,
            participantId: participant_id,
            rankIndex: nextRankIndex,
          });
      });

      return NextResponse.json({
        message: '組員移動成功',
        participant_id,
        from_group_id: groupId,
        to_group_id: new_group_id,
      });

    } else {
      // Removing from group (making ungrouped)
      await db
        .delete(groupMembers)
        .where(eq(groupMembers.id, memberData[0].id));

      return NextResponse.json({
        message: '組員移除成功',
        participant_id,
        removed_from_group_id: groupId,
      });
    }

  } catch (error) {
    console.error('Error moving group member:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          message: '資料格式錯誤',
          errors: error.issues.map(e => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: '移動組員失敗' },
      { status: 500 }
    );
  }
}