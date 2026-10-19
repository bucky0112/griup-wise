import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { STALE_GROUPING_MESSAGE, groupingManager, type GroupDetailsResult } from '@/lib/grouping/manager';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  notes: z.string().max(500).optional(),
  order_index: z.number().min(1).optional(),
});

// This route has always answered in Chinese; the manager's reasons map onto those messages
const FAILURE_RESPONSES: Record<Extract<GroupDetailsResult, { success: false }>['reason'], { message: string; status: number }> = {
  stale_grouping: { message: STALE_GROUPING_MESSAGE, status: 409 },
  forbidden: { message: '無權限編輯此分組', status: 403 },
  order_conflict: { message: '該排序位置已被其他組別使用', status: 400 },
};

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
    const updates = updateGroupSchema.parse(body);

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { message: '沒有要更新的資料' },
        { status: 400 }
      );
    }

    // The manager enforces ownership, the quiz lock and the active-run check; this route only maps responses
    const result = await groupingManager.updateGroupDetails(groupId, updates, session.id);

    if (!result.success) {
      const { message, status } = FAILURE_RESPONSES[result.reason];
      return NextResponse.json({ message }, { status });
    }

    return NextResponse.json({
      message: '分組更新成功',
      group: result.group,
    });

  } catch (error) {
    console.error('Error updating group:', error);

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
      { message: '更新分組失敗' },
      { status: 500 }
    );
  }
}
