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

interface PageProps {
  params: Promise<{ quizId: string }>;
}

interface ScoresData {
  quiz: {
    id: string;
    title: string;
    total_questions: number;
    max_possible_score: number;
  };
  participants: Array<{
    id: string;
    display_name: string;
    student_no: string;
    total_score: number | null;
    submitted_at: string | null;
    rank: number | null;
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

async function fetchScoresData(quizId: string): Promise<ScoresData> {
  const { cookies } = await import('next/headers');

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/admin/quizzes/${quizId}/scores`,
    {
      cache: 'no-store',
      headers: {
        'Cookie': (await cookies()).toString(),
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch scores data');
  }

  return response.json();
}

export default async function ScoresPage({ params }: PageProps) {
  const session = await getSession();

  if (!session || session.type !== 'admin') {
    redirect('/login');
  }

  const { quizId } = await params;

  let scoresData: ScoresData;
  try {
    scoresData = await fetchScoresData(quizId);
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
              <form className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      每組人數
                    </label>
                    <input
                      type="number"
                      name="target_group_size"
                      min="1"
                      max="20"
                      defaultValue="4"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      最少組數
                    </label>
                    <input
                      type="number"
                      name="min_groups"
                      min="1"
                      defaultValue="1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      最多組數
                    </label>
                    <input
                      type="number"
                      name="max_groups"
                      min="1"
                      defaultValue="20"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex items-end">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        name="include_unsubmitted"
                        className="mr-2"
                      />
                      <span className="text-sm">包含未交卷者</span>
                    </label>
                  </div>
                </div>

                <div className="flex space-x-4">
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                    建立分組
                  </Button>
                  <Link href={`/admin/groups/${quizId}`}>
                    <Button variant="outline">管理現有分組</Button>
                  </Link>
                </div>
              </form>
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
                    <TableHead>交卷時間</TableHead>
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
                      <TableCell className="text-sm text-gray-600">
                        {participant.submitted_at ?
                          new Date(participant.submitted_at).toLocaleString('zh-TW') :
                          '-'
                        }
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