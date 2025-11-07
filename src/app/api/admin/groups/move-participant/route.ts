import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { groupingManager } from '@/lib/grouping/manager';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.type !== 'admin') {
      return NextResponse.json({ message: '需要管理員權限' }, { status: 401 });
    }

    const { participantId, targetGroupId } = await request.json();

    if (!participantId || !targetGroupId) {
      return NextResponse.json({ message: '缺少必要參數' }, { status: 400 });
    }

    const result = await groupingManager.moveParticipant(
      participantId,
      targetGroupId,
      session.id
    );

    if (!result.success) {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }

    return NextResponse.json({
      message: result.message,
      changedGroups: result.changedGroups
    });

  } catch (error) {
    console.error('Move participant API error:', error);
    return NextResponse.json(
      { message: '移動參與者失敗' },
      { status: 500 }
    );
  }
}