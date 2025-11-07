import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { quizzes, questions, participants, submissions, answers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ quizId: string; participantId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { quizId, participantId } = await params;

  try {
    const session = await getSession();

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

    // Verify quiz exists and belongs to admin
    const quiz = await db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        created_by: quizzes.createdBy,
      })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);

    if (quiz.length === 0) {
      return NextResponse.json(
        { message: '測驗不存在' },
        { status: 404 }
      );
    }

    if (quiz[0].created_by !== session.id) {
      return NextResponse.json(
        { message: '無權限查看此測驗' },
        { status: 403 }
      );
    }

    // Verify participant exists and belongs to this quiz
    const participant = await db
      .select({
        id: participants.id,
        display_name: participants.displayName,
        student_no: participants.studentNo,
        quiz_id: participants.quizId,
        created_at: participants.createdAt,
      })
      .from(participants)
      .where(and(
        eq(participants.id, participantId),
        eq(participants.quizId, quizId)
      ))
      .limit(1);

    if (participant.length === 0) {
      return NextResponse.json(
        { message: '參與者不存在或不屬於此測驗' },
        { status: 404 }
      );
    }

    // Check if participant has submitted
    const submission = await db
      .select({
        id: submissions.id,
        total_score: submissions.totalScore,
        submitted_at: submissions.submittedAt,
      })
      .from(submissions)
      .where(and(
        eq(submissions.quizId, quizId),
        eq(submissions.participantId, participantId)
      ))
      .limit(1);

    if (submission.length === 0) {
      return NextResponse.json(
        { message: '此參與者尚未提交作答' },
        { status: 400 }
      );
    }

    // Get all questions for this quiz (ordered by order_index)
    const quizQuestions = await db
      .select({
        id: questions.id,
        type: questions.type,
        prompt: questions.prompt,
        code_snippet: questions.codeSnippet,
        code_language: questions.codeLanguage,
        options: questions.options,
        answer_key: questions.answerKey,
        score: questions.score,
        order_index: questions.orderIndex,
      })
      .from(questions)
      .where(eq(questions.quizId, quizId))
      .orderBy(questions.orderIndex);

    // Get all answers for this submission
    const studentAnswers = await db
      .select({
        question_id: answers.questionId,
        response: answers.response,
        earned_score: answers.earnedScore,
      })
      .from(answers)
      .where(eq(answers.submissionId, submission[0].id));

    // Create a map for quick lookup
    const answersMap = new Map(
      studentAnswers.map(answer => [answer.question_id, answer])
    );

    // Combine questions with student answers
    const detailedAnswers = quizQuestions.map((question, index) => {
      const studentAnswer = answersMap.get(question.id);

      return {
        question_number: index + 1,
        question: {
          id: question.id,
          type: question.type,
          prompt: question.prompt,
          code_snippet: question.code_snippet,
          code_language: question.code_language,
          options: question.options,
          correct_answer: question.answer_key,
          max_score: parseFloat(question.score),
        },
        student_answer: {
          response: studentAnswer?.response || null,
          earned_score: studentAnswer ? parseFloat(studentAnswer.earned_score) : 0,
        },
      };
    });

    return NextResponse.json({
      quiz: {
        id: quiz[0].id,
        title: quiz[0].title,
      },
      participant: {
        id: participant[0].id,
        display_name: participant[0].display_name,
        student_no: participant[0].student_no,
      },
      submission: {
        id: submission[0].id,
        total_score: parseFloat(submission[0].total_score),
        submitted_at: submission[0].submitted_at,
      },
      detailed_answers: detailedAnswers,
    });

  } catch (error) {
    console.error('Error fetching student answers:', error);
    return NextResponse.json(
      { message: '取得作答詳情失敗' },
      { status: 500 }
    );
  }
}