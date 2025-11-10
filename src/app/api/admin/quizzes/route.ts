import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { quizzes, classes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const quizSchema = z.object({
  title: z.string().min(1, '請輸入測驗標題'),
  classId: z.string().min(1, '請選擇班級'),
  isActive: z.boolean().optional().default(false),
});

export async function GET() {
  try {
    const session = await getSession();

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

    const allQuizzes = await db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        isActive: quizzes.isActive,
        createdAt: quizzes.createdAt,
        classId: quizzes.classId,
        className: classes.title,
      })
      .from(quizzes)
      .innerJoin(classes, eq(quizzes.classId, classes.id))
      .where(eq(quizzes.createdBy, session.id))
      .orderBy(quizzes.createdAt);

    return NextResponse.json({ quizzes: allQuizzes });

  } catch (error) {
    console.error('Error fetching quizzes:', error);
    return NextResponse.json(
      { message: '取得測驗列表失敗' },
      { status: 500 }
    );
  }
}

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
    const validatedData = quizSchema.parse(body);

    // Verify that the class exists and belongs to the current user
    const classExists = await db
      .select()
      .from(classes)
      .where(and(
        eq(classes.id, validatedData.classId),
        eq(classes.createdBy, session.id)
      ))
      .limit(1);

    if (classExists.length === 0) {
      return NextResponse.json(
        { message: '找不到指定的班級或您沒有權限存取該班級' },
        { status: 400 }
      );
    }

    const newQuiz = await db
      .insert(quizzes)
      .values({
        title: validatedData.title,
        classId: validatedData.classId,
        isActive: validatedData.isActive,
        createdBy: session.id,
      })
      .returning();

    return NextResponse.json(
      {
        message: '測驗建立成功',
        quiz: newQuiz[0]
      },
      { status: 201 }
    );

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          message: '輸入資料驗證失敗',
          errors: error.issues
        },
        { status: 400 }
      );
    }

    console.error('Error creating quiz:', error);
    return NextResponse.json(
      { message: '建立測驗失敗' },
      { status: 500 }
    );
  }
}