import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { groupingManager } from '@/lib/grouping/manager';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

const moveParticipantSchema = z.object({
  participantId: z.string().uuid(),
  targetGroupId: z.string().uuid(),
});

export async function PUT(request: NextRequest, { params }: RouteParams) {
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
    const { participantId, targetGroupId } = moveParticipantSchema.parse(body);

    // Use GroupingManager to move participant
    const result = await groupingManager.moveParticipant(
      participantId,
      targetGroupId,
      session.id
    );

    if (!result.success) {
      return NextResponse.json(
        { message: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: '成員移動成功',
      changedGroups: result.changedGroups,
    });

  } catch (error) {
    console.error('Error moving participant:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          message: '請求資料格式錯誤',
          errors: error.issues.map(e => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: '移動成員失敗，請稍後再試' },
      { status: 500 }
    );
  }
}