import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { groupMembers, quizzes, participants } from '@/lib/db/schema';
import { eq, and, count } from 'drizzle-orm';
import { STALE_GROUPING_MESSAGE, activeGroupIds, markRunAdminManaged } from '@/lib/grouping/manager';
import { lockQuizForGrouping } from '@/lib/grouping/quiz-lock';
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

    const body = await request.json();
    const { participant_id, new_group_id } = moveMemberSchema.parse(body);

    // The participant's quiz never changes, so it identifies the quiz even when groupId was replaced
    const participantData = await db
      .select({ quiz_id: participants.quizId, created_by: quizzes.createdBy })
      .from(participants)
      .innerJoin(quizzes, eq(participants.quizId, quizzes.id))
      .where(eq(participants.id, participant_id))
      .limit(1);

    if (participantData.length === 0) {
      return NextResponse.json(
        { message: '該參與者不在此組別中' },
        { status: 400 }
      );
    }

    if (participantData[0].created_by !== session.id) {
      return NextResponse.json(
        { message: '無權限操作此分組' },
        { status: 403 }
      );
    }

    const quizId = participantData[0].quiz_id;

    const outcome = await db.transaction(async (tx) => {
      await lockQuizForGrouping(tx, quizId);
      const groupIds = await activeGroupIds(tx, quizId);

      // Group ids read before an automatic regroup no longer belong to the active run
      if (!groupIds.has(groupId) || (new_group_id && !groupIds.has(new_group_id))) {
        return { status: 409, body: { message: STALE_GROUPING_MESSAGE } };
      }

      const [member] = await tx
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.participantId, participant_id)))
        .limit(1);

      if (!member) {
        return { status: 400, body: { message: '該參與者不在此組別中' } };
      }

      if (!new_group_id) {
        // Removing from group (making ungrouped)
        await tx.delete(groupMembers).where(eq(groupMembers.id, member.id));
        await markRunAdminManaged(tx, groupId);

        return {
          status: 200,
          body: { message: '組員移除成功', participant_id, removed_from_group_id: groupId },
        };
      }

      const [existingMember] = await tx
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, new_group_id), eq(groupMembers.participantId, participant_id)))
        .limit(1);

      if (existingMember) {
        return { status: 400, body: { message: '該參與者已在目標組別中' } };
      }

      // Get next rank index for target group
      const [targetGroupMembersCount] = await tx
        .select({ count: count() })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, new_group_id));

      await tx.delete(groupMembers).where(eq(groupMembers.id, member.id));
      await tx.insert(groupMembers).values({
        groupId: new_group_id,
        participantId: participant_id,
        rankIndex: (targetGroupMembersCount?.count || 0) + 1,
      });
      await markRunAdminManaged(tx, groupId);

      return {
        status: 200,
        body: { message: '組員移動成功', participant_id, from_group_id: groupId, to_group_id: new_group_id },
      };
    });

    return NextResponse.json(outcome.body, { status: outcome.status });

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