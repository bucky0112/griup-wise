import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { groupingManager } from '@/lib/grouping/manager';
import { z } from 'zod';

const swapParticipantsSchema = z.object({
  participant1Id: z.string().uuid(),
  participant2Id: z.string().uuid(),
});

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { participant1Id, participant2Id } = swapParticipantsSchema.parse(body);

    // Use GroupingManager to swap participants
    const result = await groupingManager.swapParticipants(
      participant1Id,
      participant2Id,
      session.id
    );

    if (!result.success) {
      return NextResponse.json(
        { message: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: '成員交換成功',
      changedGroups: result.changedGroups,
    });

  } catch (error) {
    console.error('Error swapping participants:', error);

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
      { message: '交換成員失敗，請稍後再試' },
      { status: 500 }
    );
  }
}