import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getRecentGroupingEvents } from '@/lib/grouping/triggers';
import { db, quizzes } from '@/lib/db';
import { and, eq, isNull } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
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
        createdBy: quizzes.createdBy,
      })
      .from(quizzes)
      .where(and(eq(quizzes.id, quizId), isNull(quizzes.deletedAt)))
      .limit(1);

    if (quiz.length === 0) {
      return NextResponse.json(
        { message: '測驗不存在' },
        { status: 404 }
      );
    }

    if (quiz[0].createdBy !== session.id) {
      return NextResponse.json(
        { message: '無權限查看此測驗的分組事件' },
        { status: 403 }
      );
    }

    // Get limit from query parameters
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam), 100) : 20;

    // Get recent grouping events
    const events = await getRecentGroupingEvents(quizId, limit);

    // Format events for response
    const formattedEvents = events.map(event => ({
      id: event.id,
      eventType: event.eventType,
      participantId: event.participantId,
      shouldTriggerGrouping: event.shouldTriggerGrouping,
      triggerMetadata: event.triggerMetadata,
      createdAt: event.createdAt,
      oldRankingHash: event.oldRankingHash,
      newRankingHash: event.newRankingHash,
    }));

    return NextResponse.json({
      quizId,
      events: formattedEvents,
      total: formattedEvents.length,
      limit,
    });

  } catch (error) {
    console.error('Error fetching grouping events:', error);

    return NextResponse.json(
      { message: '取得分組事件失敗，請稍後再試' },
      { status: 500 }
    );
  }
}