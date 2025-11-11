import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { questions, submissions, answers, quizzes, admins, groupingEvents } from '@/lib/db/schema';
import { eq, and, sum } from 'drizzle-orm';
import { z } from 'zod';
import { getEffectiveScore } from '@/lib/scoring';
import { groupingManager } from '@/lib/grouping/manager';

const reviewAnswerSchema = z.object({
  score: z.number().min(0, '分數不能小於 0'),
  feedback: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ answerId: string }> }
) {
  try {
    const session = await getSession();
    const { answerId } = await params;

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = reviewAnswerSchema.parse(body);

    // Verify the answer exists and belongs to a quiz created by this admin
    const answerDetails = await db
      .select({
        answerId: answers.id,
        submissionId: answers.submissionId,
        questionId: answers.questionId,
        currentScore: answers.earnedScore,
        currentManualScore: answers.manualScore,
        quizId: submissions.quizId,
        participantId: submissions.participantId,
        maxScore: questions.score,
        quizCreatedBy: quizzes.createdBy,
      })
      .from(answers)
      .innerJoin(submissions, eq(answers.submissionId, submissions.id))
      .innerJoin(questions, eq(answers.questionId, questions.id))
      .innerJoin(quizzes, eq(submissions.quizId, quizzes.id))
      .where(
        and(
          eq(answers.id, answerId),
          eq(quizzes.createdBy, session.id)
        )
      )
      .limit(1);

    if (answerDetails.length === 0) {
      return NextResponse.json(
        { message: '答案不存在或您沒有權限審核此答案' },
        { status: 404 }
      );
    }

    const answerDetail = answerDetails[0];

    // Validate score doesn't exceed maximum
    const maxScore = parseFloat(answerDetail.maxScore);
    if (validatedData.score > maxScore) {
      return NextResponse.json(
        { message: `分數不能超過題目配分 ${maxScore} 分` },
        { status: 400 }
      );
    }

    const oldScore = getEffectiveScore(answerDetail.currentScore, answerDetail.currentManualScore);

    // Use transaction to ensure data consistency
    const result = await db.transaction(async (tx) => {
      // Update the answer with manual review
      const updatedAnswer = await tx
        .update(answers)
        .set({
          manualScore: validatedData.score.toString(),
          reviewStatus: 'reviewed',
          reviewedBy: session.id,
          reviewedAt: new Date(),
          reviewFeedback: validatedData.feedback || null,
        })
        .where(eq(answers.id, answerId))
        .returning();

      // Recompute submission total score
      const allAnswers = await tx
        .select({
          earnedScore: answers.earnedScore,
          manualScore: answers.manualScore,
        })
        .from(answers)
        .where(eq(answers.submissionId, answerDetail.submissionId));

      const newTotalScore = allAnswers.reduce((total, answer) => {
        return total + getEffectiveScore(answer.earnedScore, answer.manualScore);
      }, 0);

      // Update submission total score
      const updatedSubmission = await tx
        .update(submissions)
        .set({
          totalScore: newTotalScore.toString(),
        })
        .where(eq(submissions.id, answerDetail.submissionId))
        .returning();

      return {
        answer: updatedAnswer[0],
        submission: updatedSubmission[0],
        oldScore,
        newScore: validatedData.score,
      };
    });

    // Trigger re-grouping if score changed significantly
    const scoreChange = Math.abs(result.newScore - oldScore);
    if (scoreChange > 0.01) {
      try {
        // Create grouping event
        await db.insert(groupingEvents).values({
          quizId: answerDetail.quizId,
          eventType: 'manual_review',
          participantId: answerDetail.participantId,
          triggerMetadata: {
            answerId,
            oldScore: oldScore,
            newScore: result.newScore,
            scoreChange,
            reviewedAt: new Date().toISOString(),
          },
          shouldTriggerGrouping: true,
        });

        // Trigger grouping evaluation (non-blocking)
        setImmediate(async () => {
          try {
            await groupingManager.evaluateGroupingTrigger(answerDetail.quizId);
          } catch (groupingError) {
            console.error('Grouping evaluation error after review:', groupingError);
          }
        });
      } catch (groupingEventError) {
        console.error('Failed to create grouping event:', groupingEventError);
        // Don't fail the review if grouping event creation fails
      }
    }

    return NextResponse.json({
      message: '答案審核完成',
      answer: result.answer,
      submission: result.submission,
      scoreChange: {
        old: oldScore,
        new: result.newScore,
        change: result.newScore - oldScore,
      },
    });

  } catch (error) {
    console.error('Error reviewing answer:', error);

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
      { message: '審核答案失敗，請稍後再試' },
      { status: 500 }
    );
  }
}