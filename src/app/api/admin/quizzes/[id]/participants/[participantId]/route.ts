import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { participants, quizzes } from '@/lib/db/schema';
import { lockQuizForGrouping } from '@/lib/grouping/quiz-lock';

interface RouteParams {
  params: Promise<{ id: string; participantId: string }>;
}

/**
 * Removes a participant so their student number can log in again. Submissions, answers, group memberships and
 * grouping events cascade. The active run keeps its status on purpose: only this student leaves their group, and an
 * automatic run can still place the student who logs in again.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id: quizId, participantId } = await params;
  try {
    const session = await getSession();

    if (!session || session.type !== 'admin') {
      return NextResponse.json({ message: '未授權，請重新登入' }, { status: 401 });
    }

    // The owner never changes, so it is checked before taking the grouping lock, like the member edits
    const [quiz] = await db
      .select({ createdBy: quizzes.createdBy })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);

    if (!quiz || quiz.createdBy !== session.id) {
      return NextResponse.json({ message: '無權限修改此測驗' }, { status: 403 });
    }

    // Serialized with regroups so a regroup never reads a member that is being deleted
    const deleted = await db.transaction(async (tx) => {
      await lockQuizForGrouping(tx, quizId);
      return tx
        .delete(participants)
        .where(and(eq(participants.id, participantId), eq(participants.quizId, quizId)))
        .returning({ id: participants.id });
    });

    if (deleted.length === 0) {
      return NextResponse.json({ message: '參與者不存在' }, { status: 404 });
    }

    return NextResponse.json({ message: '已刪除參與者' });
  } catch (error) {
    console.error('Error deleting participant:', error);
    return NextResponse.json({ message: '刪除參與者失敗' }, { status: 500 });
  }
}
