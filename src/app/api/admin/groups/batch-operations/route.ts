import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { editFailureStatus, groupingManager } from '@/lib/grouping/manager';
import { z } from 'zod';

const batchMoveSchema = z.object({
  operation: z.literal('move'),
  participantIds: z.array(z.string().uuid()).min(1),
  targetGroupId: z.string().uuid(),
});

const batchSwapSchema = z.object({
  operation: z.literal('swap'),
  group1Id: z.string().uuid(),
  group2Id: z.string().uuid(),
});

const batchOperationSchema = z.discriminatedUnion('operation', [
  batchMoveSchema,
  batchSwapSchema,
]);

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const operation = batchOperationSchema.parse(body);

    let result;

    switch (operation.operation) {
      case 'move':
        result = await groupingManager.batchMove(
          operation.participantIds,
          operation.targetGroupId,
          session.id
        );

        if (!result.success) {
          return NextResponse.json(
            { message: result.message },
            { status: editFailureStatus(result) }
          );
        }

        return NextResponse.json({
          message: result.message,
          affectedParticipants: result.affectedParticipants,
          affectedGroups: result.affectedGroups,
        });

      case 'swap':
        // For now, return not implemented for group swapping
        // This would require additional logic in GroupingManager
        return NextResponse.json(
          { message: '群組交換功能尚未實作' },
          { status: 501 }
        );

      default:
        return NextResponse.json(
          { message: '不支援的批次操作' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Error in batch operation:', error);

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
      { message: '批次操作失敗，請稍後再試' },
      { status: 500 }
    );
  }
}