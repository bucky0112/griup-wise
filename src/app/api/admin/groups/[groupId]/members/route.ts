import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import {
  FORBIDDEN_GROUP_EDIT_MESSAGE,
  STALE_GROUPING_MESSAGE,
  editFailureStatus,
  groupingManager,
  type GroupEditResult,
} from '@/lib/grouping/manager';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// This route has always answered in Chinese; the manager's reasons map onto those messages
const FAILURE_MESSAGES: Record<NonNullable<GroupEditResult['reason']>, string> = {
  stale_grouping: STALE_GROUPING_MESSAGE,
  forbidden: FORBIDDEN_GROUP_EDIT_MESSAGE,
  not_in_group: '該參與者不在此組別中',
  already_in_group: '該參與者已在目標組別中',
};

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

    // The manager enforces ownership, the quiz lock and the active-run check; this route only maps responses
    const result = new_group_id
      ? await groupingManager.moveParticipant(participant_id, new_group_id, session.id, { fromGroupId: groupId })
      : await groupingManager.removeParticipant(participant_id, groupId, session.id);

    if (!result.success) {
      return NextResponse.json(
        { message: FAILURE_MESSAGES[result.reason ?? 'not_in_group'] },
        { status: editFailureStatus(result) }
      );
    }

    return NextResponse.json(
      new_group_id
        ? { message: '組員移動成功', participant_id, from_group_id: groupId, to_group_id: new_group_id }
        : { message: '組員移除成功', participant_id, removed_from_group_id: groupId }
    );

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