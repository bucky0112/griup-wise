import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Link from 'next/link';
import { Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { db } from '@/lib/db';
import { quizzes, classes, questions, participants, submissions, answers, groupingRuns } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import CreateGroupsForm from '@/components/admin/CreateGroupsForm';
import { resolveDefaultGroupSize } from '@/lib/grouping/default-group-size';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ quizId: string }>;
}

interface ScoresData {
  quiz: {
    id: string;
    title: string;
    total_questions: number;
    max_possible_score: number;
    default_group_size: number;
    has_active_grouping: boolean;
  };
  participants: Array<{
    id: string;
    display_name: string;
    student_no: string;
    total_score: number | null;
    submitted_at: string | null;
    rank: number | null;
    pending_review_count: number;
    answers_detail: Array<{
      question_id: string;
      earned_score: number;
      max_score: number;
    }>;
  }>;
  statistics: {
    submitted_count: number;
    total_participants: number;
    scores: {
      mean: number;
      median: number;
      std_dev: number;
      min: number;
      max: number;
    };
    distribution_buckets: Array<{
      range: string;
      count: number;
    }>;
  };
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

async function fetchScoresData(quizId: string, adminId: string): Promise<ScoresData> {
  // Verify quiz exists and is owned by this admin
  const quiz = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      created_by: quizzes.createdBy,
      class_target_group_size: classes.targetGroupSize,
    })
    .from(quizzes)
    .innerJoin(classes, eq(quizzes.classId, classes.id))
    .where(eq(quizzes.id, quizId))
    .limit(1);

  if (quiz.length === 0) {
    throw new Error('測驗不存在');
  }

  if (quiz[0].created_by !== adminId) {
    throw new Error('無權限查看此測驗');
  }

  const activeRun = await db
    .select({ id: groupingRuns.id })
    .from(groupingRuns)
    .where(and(eq(groupingRuns.quizId, quizId), eq(groupingRuns.status, 'active')))
    .limit(1);

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
      id: submissions.id,
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
      review_status: answers.reviewStatus,
    })
    .from(answers)
    .innerJoin(submissions, eq(answers.submissionId, submissions.id))
    .where(eq(submissions.quizId, quizId));

  // Group answers by submission
  const answersMap = new Map<string, Array<{ question_id: string; earned_score: string; review_status: string }>>();
  allAnswers.forEach(answer => {
    if (!answersMap.has(answer.submission_id)) {
      answersMap.set(answer.submission_id, []);
    }
    answersMap.get(answer.submission_id)!.push({
      question_id: answer.question_id,
      earned_score: answer.earned_score,
      review_status: answer.review_status,
    });
  });

  // Process participants data
  const participantsData = allParticipants.map(participant => {
    const submission = submissionMap.get(participant.id);

    // Calculate pending review count for this participant
    let pendingReviewCount = 0;
    if (submission) {
      const participantAnswers = answersMap.get(submission.id) || [];
      pendingReviewCount = participantAnswers.filter(answer => answer.review_status === 'pending').length;
    }

    return {
      id: participant.id,
      display_name: participant.display_name,
      student_no: participant.student_no,
      total_score: submission ? parseFloat(submission.total_score) : null,
      submitted_at: submission ? submission.submitted_at?.toISOString() : null,
      rank: null as number | null, // Will be calculated below
      pending_review_count: pendingReviewCount,
      answers_detail: submission ?
        quizQuestions.map(question => {
          const answer = answersMap.get(submission.id)?.find(a => a.question_id === question.id);
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

  return {
    quiz: {
      id: quiz[0].id,
      title: quiz[0].title,
      total_questions: totalQuestions,
      max_possible_score: maxPossibleScore,
      default_group_size: resolveDefaultGroupSize(quiz[0].class_target_group_size),
      has_active_grouping: activeRun.length > 0,
    },
    participants: finalParticipantsData,
    statistics: {
      submitted_count: submittedParticipants.length,
      total_participants: allParticipants.length,
      scores: statistics,
      distribution_buckets: distributionBuckets,
    },
  };
}

export default async function ScoresPage({ params }: PageProps) {
  const session = await getSession();

  if (!session || session.type !== 'admin') {
    redirect('/login');
  }

  const { quizId } = await params;

  let scoresData: ScoresData;
  try {
    scoresData = await fetchScoresData(quizId, session.id);
  } catch (error) {
    console.error('Error fetching scores:', error);
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Card>
            <CardContent>
              <p className="text-red-600">載入分數資料失敗，請稍後再試</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { quiz, participants, statistics } = scoresData;

  // Separate submitted and unsubmitted participants
  const submittedParticipants = participants.filter(p => p.total_score !== null);
  const unsubmittedParticipants = participants.filter(p => p.total_score === null);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">分數管理</h1>
              <p className="text-gray-600">{quiz.title}</p>
            </div>
            <div className="flex space-x-4">
              <Link href="/admin/quizzes">
                <Button variant="outline">返回測驗列表</Button>
              </Link>
              <Link href="/admin">
                <Button variant="outline">返回後台</Button>
              </Link>
              <form action="/api/auth/logout" method="POST">
                <Button variant="outline" type="submit">
                  登出
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">總參與者</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.total_participants}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">已交卷</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{statistics.submitted_count}</div>
              <p className="text-xs text-gray-500">
                {((statistics.submitted_count / statistics.total_participants) * 100).toFixed(1)}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">平均分數</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.scores.mean}</div>
              <p className="text-xs text-gray-500">滿分 {quiz.max_possible_score}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">中位數</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.scores.median}</div>
              <p className="text-xs text-gray-500">
                範圍 {statistics.scores.min} - {statistics.scores.max}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Create Groups Form */}
        <div className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle>建立分組</CardTitle>
            </CardHeader>
            <CardContent>
              <CreateGroupsForm
                quizId={quiz.id}
                defaultGroupSize={quiz.default_group_size}
                hasActiveGrouping={quiz.has_active_grouping}
              />
            </CardContent>
          </Card>
        </div>

        {/* Submitted Participants Table */}
        <div className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle>已交卷參與者 ({submittedParticipants.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>排名</TableHead>
                    <TableHead>學號</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead>總分</TableHead>
                    <TableHead>待評分</TableHead>
                    <TableHead>交卷時間</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submittedParticipants.map((participant) => (
                    <TableRow key={participant.id}>
                      <TableCell className="font-medium">
                        #{participant.rank}
                      </TableCell>
                      <TableCell>{participant.student_no}</TableCell>
                      <TableCell>{participant.display_name}</TableCell>
                      <TableCell>
                        <span className="font-semibold">{participant.total_score}</span>
                        <span className="text-gray-500 text-sm ml-1">
                          / {quiz.max_possible_score}
                        </span>
                      </TableCell>
                      <TableCell>
                        {participant.pending_review_count > 0 ? (
                          <Badge variant="destructive" className="text-xs">
                            {participant.pending_review_count} 題待評分
                          </Badge>
                        ) : (
                          <span className="text-gray-500 text-xs">無</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {participant.submitted_at ?
                          new Date(participant.submitted_at).toLocaleString('zh-TW') :
                          '-'
                        }
                      </TableCell>
                      <TableCell>
                        <Link href={`/admin/answers/${quiz.id}/${participant.id}`}>
                          <Button variant="outline" size="sm">
                            <Eye className="w-4 h-4 mr-1" />
                            查看作答
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {submittedParticipants.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500">尚無學生交卷</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Unsubmitted Participants Table */}
        {unsubmittedParticipants.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>未交卷參與者 ({unsubmittedParticipants.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>學號</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead>狀態</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unsubmittedParticipants.map((participant) => (
                    <TableRow key={participant.id}>
                      <TableCell>{participant.student_no}</TableCell>
                      <TableCell>{participant.display_name}</TableCell>
                      <TableCell>
                        <span className="inline-flex px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">
                          未交卷
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}