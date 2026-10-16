import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { questions, submissions, answers, participants, quizzes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET() {
  try {
    const session = await getSession();

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

    // Get all submissions with pending reviews for quizzes created by this admin
    const pendingReviews = await db
      .select({
        submissionId: submissions.id,
        quizId: submissions.quizId,
        quizTitle: quizzes.title,
        participantId: submissions.participantId,
        participantName: participants.displayName,
        participantStudentNo: participants.studentNo,
        submittedAt: submissions.submittedAt,
        questionId: questions.id,
        questionPrompt: questions.prompt,
        questionScore: questions.score,
        responseFormat: questions.responseFormat,
        expectedLanguage: questions.expectedLanguage,
        answerKey: questions.answerKey,
        answerId: answers.id,
        response: answers.response,
      })
      .from(answers)
      .innerJoin(submissions, eq(answers.submissionId, submissions.id))
      .innerJoin(participants, eq(submissions.participantId, participants.id))
      .innerJoin(questions, eq(answers.questionId, questions.id))
      .innerJoin(quizzes, eq(submissions.quizId, quizzes.id))
      .where(
        and(
          eq(answers.reviewStatus, 'pending'),
          eq(quizzes.createdBy, session.id)
        )
      );

    // Group by submission
    const submissionsMap = new Map();

    for (const review of pendingReviews) {
      const submissionKey = review.submissionId;

      if (!submissionsMap.has(submissionKey)) {
        submissionsMap.set(submissionKey, {
          id: review.submissionId,
          quizId: review.quizId,
          quizTitle: review.quizTitle,
          participant: {
            id: review.participantId,
            displayName: review.participantName,
            studentNo: review.participantStudentNo,
          },
          submittedAt: review.submittedAt,
          pendingQuestions: []
        });
      }

      const submission = submissionsMap.get(submissionKey);

      submission.pendingQuestions.push({
        questionId: review.questionId,
        prompt: review.questionPrompt,
        responseFormat: review.responseFormat,
        expectedLanguage: review.expectedLanguage,
        maxScore: parseFloat(review.questionScore),
        answer: {
          id: review.answerId,
          response: review.response,
        }
      });
    }

    return NextResponse.json({
      submissions: Array.from(submissionsMap.values()),
    });

  } catch (error) {
    console.error('Error fetching pending reviews:', error);
    return NextResponse.json(
      { message: '取得待審核項目失敗，請稍後再試' },
      { status: 500 }
    );
  }
}