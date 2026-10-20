import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { quizzes } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const updateQuizSchema = z.object({
  show_group_publicly: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: RouteParams) {
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
        created_by: quizzes.createdBy,
        show_group_publicly: quizzes.showGroupPublicly,
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

    if (quiz[0].created_by !== session.id) {
      return NextResponse.json(
        { message: '無權限修改此測驗' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const updates = updateQuizSchema.parse(body);

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { message: '沒有要更新的資料' },
        { status: 400 }
      );
    }

    // Update the quiz
    const updatedQuiz = await db
      .update(quizzes)
      .set({
        ...(updates.show_group_publicly !== undefined && {
          showGroupPublicly: updates.show_group_publicly
        }),
        ...(updates.is_active !== undefined && { isActive: updates.is_active }),
      })
      // Re-check deleted_at in the update itself so a concurrent DELETE cannot be undone by re-activation
      .where(and(eq(quizzes.id, quizId), isNull(quizzes.deletedAt)))
      .returning();

    if (updatedQuiz.length === 0) {
      return NextResponse.json(
        { message: '測驗不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: '測驗設定更新成功',
      quiz: {
        id: updatedQuiz[0].id,
        title: updatedQuiz[0].title,
        show_group_publicly: updatedQuiz[0].showGroupPublicly,
        is_active: updatedQuiz[0].isActive,
      },
    });

  } catch (error) {
    console.error('Error updating quiz:', error);

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
      { message: '更新測驗失敗' },
      { status: 500 }
    );
  }
}

// Soft delete: the quiz and its submissions stay in the database; deactivating it makes the
// student login, assignment and submit routes refuse it through their existing is_active check.
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id: quizId } = await params;
  try {
    const session = await getSession();

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

    const [quiz] = await db
      .select({ createdBy: quizzes.createdBy })
      .from(quizzes)
      .where(and(eq(quizzes.id, quizId), isNull(quizzes.deletedAt)))
      .limit(1);

    if (!quiz) {
      return NextResponse.json({ message: '測驗不存在' }, { status: 404 });
    }

    if (quiz.createdBy !== session.id) {
      return NextResponse.json({ message: '無權限修改此測驗' }, { status: 403 });
    }

    await db
      .update(quizzes)
      .set({ deletedAt: new Date(), isActive: false })
      .where(and(eq(quizzes.id, quizId), isNull(quizzes.deletedAt)));

    return NextResponse.json({ message: '測驗已刪除' });
  } catch (error) {
    console.error('Error deleting quiz:', error);
    return NextResponse.json(
      { message: '刪除測驗失敗' },
      { status: 500 }
    );
  }
}
