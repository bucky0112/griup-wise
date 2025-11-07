import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { questions, submissions, answers, quizzes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { calculateScore } from '@/lib/scoring';

const submitAnswerSchema = z.object({
  answers: z.record(z.string(), z.unknown()) // questionId -> answer
});


export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session || session.type !== 'student') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

    // Check if quiz exists and is active
    const quiz = await db
      .select()
      .from(quizzes)
      .where(and(
        eq(quizzes.id, session.quizId),
        eq(quizzes.isActive, true)
      ))
      .limit(1);

    if (quiz.length === 0) {
      return NextResponse.json(
        { message: '測驗不存在或已關閉，無法提交答案' },
        { status: 400 }
      );
    }

    // Check if student has already submitted
    const existingSubmission = await db
      .select()
      .from(submissions)
      .where(and(
        eq(submissions.quizId, session.quizId),
        eq(submissions.participantId, session.participantId)
      ))
      .limit(1);

    if (existingSubmission.length > 0) {
      return NextResponse.json(
        { message: '您已提交過此測驗，無法重複提交' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { answers: studentAnswers } = submitAnswerSchema.parse(body);

    // Get all questions for this quiz
    const quizQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.quizId, session.quizId));

    if (quizQuestions.length === 0) {
      return NextResponse.json(
        { message: '此測驗沒有題目，無法提交' },
        { status: 400 }
      );
    }

    // Validate that all questions have answers
    const missingAnswers = quizQuestions.filter(q => !(q.id in studentAnswers));
    if (missingAnswers.length > 0) {
      return NextResponse.json(
        {
          message: '請完成所有題目後再提交',
          missingQuestions: missingAnswers.length
        },
        { status: 400 }
      );
    }

    // Calculate scores for each question
    const scoredAnswers = quizQuestions.map(question => {
      const studentAnswer = studentAnswers[question.id];
      const maxScore = parseFloat(question.score);
      const earnedScore = calculateScore(
        question.type,
        studentAnswer,
        question.answerKey,
        maxScore
      );

      return {
        questionId: question.id,
        response: studentAnswer,
        earnedScore: earnedScore.toString()
      };
    });

    const totalScore = scoredAnswers.reduce((sum, answer) => sum + parseFloat(answer.earnedScore), 0);

    // Use transaction to ensure data consistency
    const result = await db.transaction(async (tx) => {
      // Create submission record
      const newSubmission = await tx
        .insert(submissions)
        .values({
          quizId: session.quizId,
          participantId: session.participantId,
          totalScore: totalScore.toString(),
        })
        .returning();

      const submissionId = newSubmission[0].id;

      // Create answer records
      const answerRecords = scoredAnswers.map(answer => ({
        submissionId,
        questionId: answer.questionId,
        response: answer.response,
        earnedScore: answer.earnedScore
      }));

      await tx.insert(answers).values(answerRecords);

      return newSubmission[0];
    });

    return NextResponse.json({
      message: '答案提交成功！感謝您的參與。',
      submissionId: result.id,
      submittedAt: result.submittedAt,
      totalQuestions: quizQuestions.length
    });

  } catch (error) {
    console.error('Error submitting answers:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          message: '提交資料格式錯誤',
          errors: error.issues.map(e => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: '提交失敗，請稍後再試' },
      { status: 500 }
    );
  }
}