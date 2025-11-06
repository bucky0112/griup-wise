import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { questions, submissions, quizzes } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';

export async function GET() {
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
      return NextResponse.json({
        status: 'no_assignment',
        message: '目前沒有可作答的測驗，請聯絡任課老師確認測驗狀態。'
      });
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
      return NextResponse.json({
        status: 'completed',
        message: '您已完成此測驗的作答，感謝您的參與！',
        submittedAt: existingSubmission[0].submittedAt
      });
    }

    // Get all questions for this quiz (exclude answer_key for students)
    const quizQuestions = await db
      .select({
        id: questions.id,
        type: questions.type,
        prompt: questions.prompt,
        codeSnippet: questions.codeSnippet,
        codeLanguage: questions.codeLanguage,
        options: questions.options,
        score: questions.score,
        orderIndex: questions.orderIndex
      })
      .from(questions)
      .where(eq(questions.quizId, session.quizId))
      .orderBy(asc(questions.orderIndex));

    if (quizQuestions.length === 0) {
      return NextResponse.json({
        status: 'no_assignment',
        message: '此測驗目前沒有題目，請聯絡任課老師。'
      });
    }

    return NextResponse.json({
      status: 'ready_to_answer',
      quiz: {
        id: quiz[0].id,
        title: quiz[0].title,
        totalQuestions: quizQuestions.length,
        totalScore: quizQuestions.reduce((sum, q) => sum + parseFloat(q.score), 0)
      },
      questions: quizQuestions,
      participant: {
        id: session.participantId,
        displayName: session.displayName,
        studentNo: session.studentNo
      }
    });

  } catch (error) {
    console.error('Error fetching assignment:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: '系統發生錯誤，請稍後再試或聯絡技術支援。'
      },
      { status: 500 }
    );
  }
}