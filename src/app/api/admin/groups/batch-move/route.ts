import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { groupingManager } from '@/lib/grouping/manager';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.type !== 'admin') {
      return NextResponse.json({ message: '需要管理員權限' }, { status: 401 });
    }

    const { participantIds, targetGroupId } = await request.json();

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return NextResponse.json({ message: '缺少要移動的參與者列表' }, { status: 400 });
    }

    if (!targetGroupId) {
      return NextResponse.json({ message: '缺少目標組別ID' }, { status: 400 });
    }

    const result = await groupingManager.batchMove(
      participantIds,
      targetGroupId,
      session.id
    );

    if (!result.success) {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }

    return NextResponse.json({
      message: result.message,
      affectedParticipants: result.affectedParticipants,
      affectedGroups: result.affectedGroups
    });

  } catch (error) {
    console.error('Batch move API error:', error);
    return NextResponse.json(
      { message: '批量移動失敗' },
      { status: 500 }
    );
  }
}