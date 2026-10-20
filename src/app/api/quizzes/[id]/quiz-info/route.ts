import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { quizzes, classes } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const { id: quizId } = await params;

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

    // Get quiz info with class name
    const quiz = await db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        isActive: quizzes.isActive,
        className: classes.title,
      })
      .from(quizzes)
      .innerJoin(classes, eq(quizzes.classId, classes.id))
      .where(and(eq(quizzes.id, quizId), eq(quizzes.createdBy, session.id), isNull(quizzes.deletedAt)))
      .limit(1);

    if (quiz.length === 0) {
      return NextResponse.json(
        { message: '測驗不存在或您沒有權限管理此測驗' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      quiz: quiz[0],
    });

  } catch (error) {
    console.error('Error fetching quiz info:', error);
    return NextResponse.json(
      { message: '取得測驗資訊失敗，請稍後再試' },
      { status: 500 }
    );
  }
}