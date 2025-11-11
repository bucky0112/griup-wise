import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { questions, submissions, answers, quizzes, groupingEvents } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getEffectiveScore } from '@/lib/scoring';
import { groupingManager } from '@/lib/grouping/manager';

const batchReviewSchema = z.object({
  reviews: z.array(z.object({
    answerId: z.string().uuid(),
    score: z.number().min(0, '分數不能小於 0'),
    feedback: z.string().optional(),
  })).min(1, '至少需要審核一個答案'),
});

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
    const validatedData = batchReviewSchema.parse(body);

    const answerIds = validatedData.reviews.map(r => r.answerId);

    // Verify all answers exist and belong to quizzes created by this admin
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
          inArray(answers.id, answerIds),
          eq(quizzes.createdBy, session.id)
        )
      );

    if (answerDetails.length !== answerIds.length) {
      return NextResponse.json(
        { message: '部分答案不存在或您沒有權限審核' },
        { status: 400 }
      );
    }

    // Validate scores don't exceed maximums
    const reviewsMap = new Map(validatedData.reviews.map(r => [r.answerId, r]));

    for (const answerDetail of answerDetails) {
      const review = reviewsMap.get(answerDetail.answerId);
      if (!review) continue;

      const maxScore = parseFloat(answerDetail.maxScore);
      if (review.score > maxScore) {
        return NextResponse.json(
          { message: `答案 ${answerDetail.answerId} 的分數不能超過題目配分 ${maxScore} 分` },
          { status: 400 }
        );
      }
    }

    // Use transaction to ensure data consistency
    const result = await db.transaction(async (tx) => {
      const updatedAnswers = [];
      const submissionUpdates = new Map(); // submissionId -> { oldTotal, newTotal, answers }
      const scoreChanges = [];

      // Update all answers
      for (const answerDetail of answerDetails) {
        const review = reviewsMap.get(answerDetail.answerId);
        if (!review) continue;

        const oldScore = getEffectiveScore(answerDetail.currentScore, answerDetail.currentManualScore);

        // Update the answer
        const updatedAnswer = await tx
          .update(answers)
          .set({
            manualScore: review.score.toString(),
            reviewStatus: 'reviewed',
            reviewedBy: session.id,
            reviewedAt: new Date(),
            reviewFeedback: review.feedback || null,
          })
          .where(eq(answers.id, answerDetail.answerId))
          .returning();

        updatedAnswers.push(updatedAnswer[0]);

        scoreChanges.push({
          answerId: answerDetail.answerId,
          participantId: answerDetail.participantId,
          quizId: answerDetail.quizId,
          oldScore,
          newScore: review.score,
          change: review.score - oldScore,
        });

        // Track submission for total score recalculation
        if (!submissionUpdates.has(answerDetail.submissionId)) {
          submissionUpdates.set(answerDetail.submissionId, {
            submissionId: answerDetail.submissionId,
            quizId: answerDetail.quizId,
            participantId: answerDetail.participantId,
            answers: [],
          });
        }
      }

      // Recompute total scores for affected submissions
      const updatedSubmissions = [];
      for (const [submissionId, submissionData] of submissionUpdates) {
        // Get all answers for this submission
        const allAnswers = await tx
          .select({
            earnedScore: answers.earnedScore,
            manualScore: answers.manualScore,
          })
          .from(answers)
          .where(eq(answers.submissionId, submissionId));

        const newTotalScore = allAnswers.reduce((total, answer) => {
          return total + getEffectiveScore(answer.earnedScore, answer.manualScore);
        }, 0);

        // Update submission total score
        const updatedSubmission = await tx
          .update(submissions)
          .set({
            totalScore: newTotalScore.toString(),
          })
          .where(eq(submissions.id, submissionId))
          .returning();

        updatedSubmissions.push(updatedSubmission[0]);
      }

      return {
        updatedAnswers,
        updatedSubmissions,
        scoreChanges,
      };
    });

    // Create grouping events for significant score changes
    try {
      const significantChanges = result.scoreChanges.filter(change => Math.abs(change.change) > 0.01);

      if (significantChanges.length > 0) {
        // Group by quiz for efficiency
        const quizChanges = new Map();
        for (const change of significantChanges) {
          if (!quizChanges.has(change.quizId)) {
            quizChanges.set(change.quizId, []);
          }
          quizChanges.get(change.quizId).push(change);
        }

        // Create grouping events
        const groupingEventPromises = Array.from(quizChanges.entries()).map(([quizId, changes]) =>
          db.insert(groupingEvents).values({
            quizId,
            eventType: 'batch_review',
            triggerMetadata: {
              batchSize: changes.length,
              totalScoreChange: changes.reduce((sum, c) => sum + Math.abs(c.change), 0),
              affectedParticipants: [...new Set(changes.map(c => c.participantId))],
              reviewedAt: new Date().toISOString(),
            },
            shouldTriggerGrouping: true,
          })
        );

        await Promise.all(groupingEventPromises);

        // Trigger grouping evaluation for affected quizzes (non-blocking)
        setImmediate(async () => {
          try {
            const evaluationPromises = Array.from(quizChanges.keys()).map(quizId =>
              groupingManager.evaluateGroupingTrigger(quizId)
            );
            await Promise.all(evaluationPromises);
          } catch (groupingError) {
            console.error('Grouping evaluation error after batch review:', groupingError);
          }
        });
      }
    } catch (groupingEventError) {
      console.error('Failed to create grouping events:', groupingEventError);
      // Don't fail the review if grouping event creation fails
    }

    return NextResponse.json({
      message: `成功審核 ${result.updatedAnswers.length} 個答案`,
      updatedAnswers: result.updatedAnswers,
      updatedSubmissions: result.updatedSubmissions,
      scoreChanges: result.scoreChanges,
      summary: {
        totalReviewed: result.updatedAnswers.length,
        submissionsAffected: result.updatedSubmissions.length,
        significantChanges: result.scoreChanges.filter(c => Math.abs(c.change) > 0.01).length,
      },
    });

  } catch (error) {
    console.error('Error batch reviewing answers:', error);

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
      { message: '批次審核失敗，請稍後再試' },
      { status: 500 }
    );
  }
}