import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { questions, quizzes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const updateQuestionSchema = z.object({
  prompt: z.string().min(1, '題目內容不可為空'),
  type: z.enum(['single', 'multiple'], {
    message: '題目類型必須是 single 或 multiple',
  }),
  score: z.number().positive('分數必須大於 0'),
  options: z.array(z.string().min(1, '選項不可為空')).min(2, '至少需要 2 個選項'),
  correctAnswers: z.array(z.string()).min(1, '至少需要選擇一個正確答案'),
  codeSnippet: z.string().optional(),
  codeLanguage: z.string().optional(),
});

// PUT - Update question
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  try {
    const session = await getSession();
    const { id: quizId, questionId } = await params;

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

    // Verify quiz exists and belongs to admin
    const quiz = await db
      .select()
      .from(quizzes)
      .where(and(eq(quizzes.id, quizId), eq(quizzes.createdBy, session.id)))
      .limit(1);

    if (quiz.length === 0) {
      return NextResponse.json(
        { message: '測驗不存在或您沒有權限管理此測驗' },
        { status: 404 }
      );
    }

    // Verify question exists and belongs to the quiz
    const existingQuestion = await db
      .select()
      .from(questions)
      .where(and(eq(questions.id, questionId), eq(questions.quizId, quizId)))
      .limit(1);

    if (existingQuestion.length === 0) {
      return NextResponse.json(
        { message: '題目不存在' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = updateQuestionSchema.parse(body);

    // Validate correct answers are in options
    const invalidAnswers = validatedData.correctAnswers.filter(
      answer => !validatedData.options.includes(answer)
    );

    if (invalidAnswers.length > 0) {
      return NextResponse.json(
        { message: '正確答案必須是選項中的其中一個' },
        { status: 400 }
      );
    }

    // For single choice, only allow one correct answer
    if (validatedData.type === 'single' && validatedData.correctAnswers.length !== 1) {
      return NextResponse.json(
        { message: '單選題只能有一個正確答案' },
        { status: 400 }
      );
    }

    // Update question
    const updatedQuestion = await db
      .update(questions)
      .set({
        type: validatedData.type,
        prompt: validatedData.prompt,
        codeSnippet: validatedData.codeSnippet || null,
        codeLanguage: validatedData.codeLanguage || null,
        options: validatedData.options,
        answerKey: validatedData.correctAnswers,
        score: validatedData.score.toString(),
      })
      .where(eq(questions.id, questionId))
      .returning();

    return NextResponse.json(
      {
        message: '題目更新成功',
        question: updatedQuestion[0],
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error updating question:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          message: '資料驗證失敗',
          errors: error.issues.map(e => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: '更新題目失敗，請稍後再試' },
      { status: 500 }
    );
  }
}

// DELETE - Delete question
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  try {
    const session = await getSession();
    const { id: quizId, questionId } = await params;

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

    // Verify quiz exists and belongs to admin
    const quiz = await db
      .select()
      .from(quizzes)
      .where(and(eq(quizzes.id, quizId), eq(quizzes.createdBy, session.id)))
      .limit(1);

    if (quiz.length === 0) {
      return NextResponse.json(
        { message: '測驗不存在或您沒有權限管理此測驗' },
        { status: 404 }
      );
    }

    // Verify question exists and belongs to the quiz
    const existingQuestion = await db
      .select()
      .from(questions)
      .where(and(eq(questions.id, questionId), eq(questions.quizId, quizId)))
      .limit(1);

    if (existingQuestion.length === 0) {
      return NextResponse.json(
        { message: '題目不存在' },
        { status: 404 }
      );
    }

    // Delete question
    await db
      .delete(questions)
      .where(eq(questions.id, questionId));

    return NextResponse.json(
      { message: '題目刪除成功' },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error deleting question:', error);
    return NextResponse.json(
      { message: '刪除題目失敗，請稍後再試' },
      { status: 500 }
    );
  }
}

// GET - Get single question
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  try {
    const session = await getSession();
    const { id: quizId, questionId } = await params;

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

    // Verify quiz exists and belongs to admin
    const quiz = await db
      .select()
      .from(quizzes)
      .where(and(eq(quizzes.id, quizId), eq(quizzes.createdBy, session.id)))
      .limit(1);

    if (quiz.length === 0) {
      return NextResponse.json(
        { message: '測驗不存在或您沒有權限管理此測驗' },
        { status: 404 }
      );
    }

    // Get question
    const question = await db
      .select()
      .from(questions)
      .where(and(eq(questions.id, questionId), eq(questions.quizId, quizId)))
      .limit(1);

    if (question.length === 0) {
      return NextResponse.json(
        { message: '題目不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      question: question[0],
    });

  } catch (error) {
    console.error('Error fetching question:', error);
    return NextResponse.json(
      { message: '取得題目失敗，請稍後再試' },
      { status: 500 }
    );
  }
}