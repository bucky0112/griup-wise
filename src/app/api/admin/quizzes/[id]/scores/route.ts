import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { quizzes, questions, participants, submissions, answers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Helper function to calculate statistics
function calculateStatistics(scores: number[]) {
  if (scores.length === 0) {
    return {
      mean: 0,
      median: 0,
      std_dev: 0,
      min: 0,
      max: 0,
    };
  }

  const sortedScores = [...scores].sort((a, b) => a - b);
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;

  const median = sortedScores.length % 2 === 0
    ? (sortedScores[sortedScores.length / 2 - 1] + sortedScores[sortedScores.length / 2]) / 2
    : sortedScores[Math.floor(sortedScores.length / 2)];

  const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
  const std_dev = Math.sqrt(variance);

  return {
    mean: Number(mean.toFixed(2)),
    median: Number(median.toFixed(2)),
    std_dev: Number(std_dev.toFixed(2)),
    min: sortedScores[0],
    max: sortedScores[sortedScores.length - 1],
  };
}

// Helper function to create distribution buckets
function createDistributionBuckets(scores: number[], maxScore: number) {
  const bucketSize = Math.max(1, Math.ceil(maxScore / 10)); // 10 buckets
  const buckets = [];

  for (let i = 0; i < maxScore; i += bucketSize) {
    const start = i;
    const end = Math.min(i + bucketSize - 1, maxScore);
    const count = scores.filter(score => score >= start && score <= end).length;

    buckets.push({
      range: `${start}-${end}`,
      count,
    });
  }

  return buckets;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: quizId } = await params;
  try {
    const session = await getSession();

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }


    // Verify quiz exists and is owned by this admin
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

    // Get quiz questions and calculate total possible score
    const quizQuestions = await db
      .select({
        id: questions.id,
        score: questions.score,
      })
      .from(questions)
      .where(eq(questions.quizId, quizId));

    const totalQuestions = quizQuestions.length;
    const maxPossibleScore = quizQuestions.reduce((sum, q) => sum + parseFloat(q.score), 0);

    // Get all participants for this quiz
    const allParticipants = await db
      .select({
        id: participants.id,
        display_name: participants.displayName,
        student_no: participants.studentNo,
        created_at: participants.createdAt,
      })
      .from(participants)
      .where(eq(participants.quizId, quizId));

    // Get all submissions with scores
    const submissionData = await db
      .select({
        participant_id: submissions.participantId,
        total_score: submissions.totalScore,
        submitted_at: submissions.submittedAt,
      })
      .from(submissions)
      .where(eq(submissions.quizId, quizId));

    // Create a map for quick lookup
    const submissionMap = new Map(
      submissionData.map(s => [s.participant_id, s])
    );

    // Get detailed answers for all submissions
    const allAnswers = await db
      .select({
        submission_id: answers.submissionId,
        question_id: answers.questionId,
        earned_score: answers.earnedScore,
      })
      .from(answers)
      .innerJoin(submissions, eq(answers.submissionId, submissions.id))
      .where(eq(submissions.quizId, quizId));

    // Group answers by submission
    const answersMap = new Map<string, Array<{ question_id: string; earned_score: string }>>();
    allAnswers.forEach(answer => {
      if (!answersMap.has(answer.submission_id)) {
        answersMap.set(answer.submission_id, []);
      }
      answersMap.get(answer.submission_id)!.push({
        question_id: answer.question_id,
        earned_score: answer.earned_score,
      });
    });

    // Process participants data
    const participantsData = allParticipants.map(participant => {
      const submission = submissionMap.get(participant.id);

      return {
        id: participant.id,
        display_name: participant.display_name,
        student_no: participant.student_no,
        total_score: submission ? parseFloat(submission.total_score) : null,
        submitted_at: submission ? submission.submitted_at : null,
        rank: null as number | null, // Will be calculated below
        answers_detail: submission ?
          quizQuestions.map(question => {
            const answer = answersMap.get(submission.participant_id)?.find(a => a.question_id === question.id);
            return {
              question_id: question.id,
              earned_score: answer ? parseFloat(answer.earned_score) : 0,
              max_score: parseFloat(question.score),
            };
          }) : [],
      };
    });

    // Sort by score for ranking (highest first)
    const submittedParticipants = participantsData
      .filter(p => p.total_score !== null)
      .sort((a, b) => (b.total_score! - a.total_score!) ||
                     (new Date(a.submitted_at!).getTime() - new Date(b.submitted_at!).getTime()));

    // Assign ranks
    submittedParticipants.forEach((participant, index) => {
      participant.rank = index + 1;
    });

    // Calculate statistics from submitted scores
    const scores = submittedParticipants.map(p => p.total_score!);
    const statistics = calculateStatistics(scores);
    const distributionBuckets = createDistributionBuckets(scores, maxPossibleScore);

    // Combine submitted and unsubmitted participants
    const finalParticipantsData = [
      ...submittedParticipants,
      ...participantsData.filter(p => p.total_score === null)
    ];

    return NextResponse.json({
      quiz: {
        id: quiz[0].id,
        title: quiz[0].title,
        total_questions: totalQuestions,
        max_possible_score: maxPossibleScore,
      },
      participants: finalParticipantsData,
      statistics: {
        submitted_count: submittedParticipants.length,
        total_participants: allParticipants.length,
        scores: statistics,
        distribution_buckets: distributionBuckets,
      },
    });

  } catch (error) {
    console.error('Error fetching quiz scores:', error);
    return NextResponse.json(
      { message: '取得分數資料失敗' },
      { status: 500 }
    );
  }
}