import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { questions, quizzes } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';

const createQuestionSchema = z.object({
  prompt: z.string().min(1, '題目內容不可為空'),
  type: z.enum(['single', 'multiple', 'short_text'], {
    message: '題目類型必須是 single, multiple 或 short_text',
  }),
  score: z.number().positive('分數必須大於 0'),
  options: z.array(z.string().min(1, '選項不可為空')).min(2, '至少需要 2 個選項').optional(),
  correctAnswers: z.array(z.string()).min(1, '至少需要選擇一個正確答案').optional(),
  orderIndex: z.number().int().positive('順序必須是正整數'),
  codeSnippet: z.string().optional(),
  codeLanguage: z.string().optional(),
  responseFormat: z.enum(['text', 'code']).optional(),
  expectedLanguage: z.string().optional(),
});

export async function POST(
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

    // Verify quiz exists and belongs to admin
    const quiz = await db
      .select()
      .from(quizzes)
      .where(and(eq(quizzes.id, quizId), eq(quizzes.createdBy, session.id), isNull(quizzes.deletedAt)))
      .limit(1);

    if (quiz.length === 0) {
      return NextResponse.json(
        { message: '測驗不存在或您沒有權限管理此測驗' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = createQuestionSchema.parse(body);

    // Type-specific validation
    if (validatedData.type === 'single' || validatedData.type === 'multiple') {
      // Choice-based questions need options and correct answers
      if (!validatedData.options || !validatedData.correctAnswers) {
        return NextResponse.json(
          { message: '單選題和多選題必須提供選項和正確答案' },
          { status: 400 }
        );
      }

      // Validate correct answers are in options
      const invalidAnswers = validatedData.correctAnswers.filter(
        answer => !validatedData.options!.includes(answer)
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
    } else if (validatedData.type === 'short_text') {
      // Short text questions need response format
      if (!validatedData.responseFormat) {
        return NextResponse.json(
          { message: '問答題必須指定回答格式（text 或 code）' },
          { status: 400 }
        );
      }

      // Code format questions should have expected language
      if (validatedData.responseFormat === 'code' && !validatedData.expectedLanguage) {
        return NextResponse.json(
          { message: '程式碼題目必須指定預期程式語言' },
          { status: 400 }
        );
      }
    }

    // Prepare answerKey based on question type
    let answerKey;
    if (validatedData.type === 'short_text') {
      // For manual review questions, store metadata instead of correct answers
      answerKey = {
        type: 'manual_review',
        maxPoints: validatedData.score,
      };
    } else {
      // For choice-based questions, store correct answers as before
      answerKey = validatedData.correctAnswers;
    }

    // Create question
    const newQuestion = await db
      .insert(questions)
      .values({
        quizId,
        type: validatedData.type,
        prompt: validatedData.prompt,
        codeSnippet: validatedData.codeSnippet || null,
        codeLanguage: validatedData.codeLanguage || null,
        options: validatedData.options || null,
        answerKey,
        score: validatedData.score.toString(),
        orderIndex: validatedData.orderIndex,
        responseFormat: validatedData.responseFormat || null,
        expectedLanguage: validatedData.expectedLanguage || null,
      })
      .returning();

    return NextResponse.json(
      {
        message: '題目新增成功',
        question: newQuestion[0],
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Error creating question:', error);

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
      { message: '新增題目失敗，請稍後再試' },
      { status: 500 }
    );
  }
}

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

    // Verify quiz exists and belongs to admin
    const quiz = await db
      .select()
      .from(quizzes)
      .where(and(eq(quizzes.id, quizId), eq(quizzes.createdBy, session.id), isNull(quizzes.deletedAt)))
      .limit(1);

    if (quiz.length === 0) {
      return NextResponse.json(
        { message: '測驗不存在或您沒有權限管理此測驗' },
        { status: 404 }
      );
    }

    // Get all questions for this quiz
    const quizQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.quizId, quizId))
      .orderBy(questions.orderIndex);

    return NextResponse.json({
      questions: quizQuestions,
    });

  } catch (error) {
    console.error('Error fetching questions:', error);
    return NextResponse.json(
      { message: '取得題目失敗，請稍後再試' },
      { status: 500 }
    );
  }
}