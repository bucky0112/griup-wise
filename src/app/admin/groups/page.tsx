import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { db } from '@/lib/db';
import { quizzes, classes, participants, submissions, groupingRuns, groups } from '@/lib/db/schema';
import { eq, and, count, isNull } from 'drizzle-orm';

interface OverviewData {
  statistics: {
    total_quizzes: number;
    grouped_quizzes: number;
    public_groups: number;
  };
  quizzes: Array<{
    id: string;
    title: string;
    class_title: string;
    created_at: string;
    grouping_status: 'ungrouped' | 'grouped' | 'public';
    active_run: {
      id: string;
      created_at: string;
      groups_count: number;
      total_members: number;
    } | null;
    participants_count: number;
    submissions_count: number;
  }>;
}

async function fetchOverviewData(adminId: string): Promise<OverviewData> {
  // Get all quizzes created by this admin with related data
  const adminQuizzes = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      class_title: classes.title,
      created_at: quizzes.createdAt,
      show_group_publicly: quizzes.showGroupPublicly,
    })
    .from(quizzes)
    .innerJoin(classes, eq(quizzes.classId, classes.id))
    .where(and(eq(quizzes.createdBy, adminId), isNull(quizzes.deletedAt)))
    .orderBy(quizzes.createdAt);

  // Get statistics for each quiz
  const quizData = await Promise.all(
    adminQuizzes.map(async (quiz) => {
      // Get participants count
      const participantsResult = await db
        .select({ count: count() })
        .from(participants)
        .where(eq(participants.quizId, quiz.id));

      const participantsCount = participantsResult[0]?.count || 0;

      // Get submissions count
      const submissionsResult = await db
        .select({ count: count() })
        .from(submissions)
        .where(eq(submissions.quizId, quiz.id));

      const submissionsCount = submissionsResult[0]?.count || 0;

      // Get active grouping run
      const activeRun = await db
        .select({
          id: groupingRuns.id,
          created_at: groupingRuns.createdAt,
          config: groupingRuns.config,
        })
        .from(groupingRuns)
        .where(and(
          eq(groupingRuns.quizId, quiz.id),
          eq(groupingRuns.status, 'active')
        ))
        .limit(1);

      // Get groups count for active run
      let groupsCount = 0;
      let totalMembers = 0;
      if (activeRun.length > 0) {
        const groupsResult = await db
          .select({ count: count() })
          .from(groups)
          .where(eq(groups.groupingRunId, activeRun[0].id));

        groupsCount = groupsResult[0]?.count || 0;

        // Get total members in groups
        const membersResult = await db
          .select({ count: count() })
          .from(groups)
          .innerJoin(groupingRuns, eq(groups.groupingRunId, groupingRuns.id))
          .where(and(
            eq(groupingRuns.quizId, quiz.id),
            eq(groupingRuns.status, 'active')
          ));

        totalMembers = membersResult[0]?.count || 0;
      }

      // Determine grouping status
      let groupingStatus: 'ungrouped' | 'grouped' | 'public';
      if (quiz.show_group_publicly) {
        groupingStatus = 'public';
      } else if (activeRun.length > 0 && groupsCount > 0) {
        groupingStatus = 'grouped';
      } else {
        groupingStatus = 'ungrouped';
      }

      return {
        id: quiz.id,
        title: quiz.title,
        class_title: quiz.class_title,
        created_at: quiz.created_at.toISOString(),
        grouping_status: groupingStatus,
        active_run: activeRun.length > 0 ? {
          id: activeRun[0].id,
          created_at: activeRun[0].created_at.toISOString(),
          groups_count: groupsCount,
          total_members: totalMembers,
        } : null,
        participants_count: participantsCount,
        submissions_count: submissionsCount,
      };
    })
  );

  // Calculate overall statistics
  const totalQuizzes = quizData.length;
  const groupedQuizzes = quizData.filter(q => q.grouping_status === 'grouped' || q.grouping_status === 'public').length;
  const publicGroups = quizData.filter(q => q.grouping_status === 'public').length;

  return {
    statistics: {
      total_quizzes: totalQuizzes,
      grouped_quizzes: groupedQuizzes,
      public_groups: publicGroups,
    },
    quizzes: quizData,
  };
}

function getStatusBadge(status: 'ungrouped' | 'grouped' | 'public') {
  const styles = {
    ungrouped: 'bg-gray-100 text-gray-800',
    grouped: 'bg-blue-100 text-blue-800',
    public: 'bg-green-100 text-green-800',
  };

  const labels = {
    ungrouped: '未分組',
    grouped: '已分組',
    public: '已公開',
  };

  return (
    <span className={`inline-flex px-2 py-1 text-xs rounded-full ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export default async function GroupsOverviewPage() {
  const session = await getSession();

  if (!session || session.type !== 'admin') {
    redirect('/login');
  }

  let overviewData: OverviewData;
  try {
    overviewData = await fetchOverviewData(session.id);
  } catch (error) {
    console.error('Error fetching overview:', error);
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Card>
            <CardContent>
              <p className="text-red-600">載入資料失敗，請稍後再試</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { statistics, quizzes } = overviewData;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">分組管理總覽</h1>
              <p className="text-gray-600">管理所有測驗的分組狀況</p>
            </div>
            <div className="flex space-x-4">
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
        {/* Statistics Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">總測驗數</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.total_quizzes}</div>
              <p className="text-xs text-gray-500">您建立的所有測驗</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">已分組測驗</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{statistics.grouped_quizzes}</div>
              <p className="text-xs text-gray-500">
                {statistics.total_quizzes > 0
                  ? `${((statistics.grouped_quizzes / statistics.total_quizzes) * 100).toFixed(1)}%`
                  : '0%'
                }
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">公開分組數</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{statistics.public_groups}</div>
              <p className="text-xs text-gray-500">學生可查看的分組</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="mb-6">
          <Card>
            <CardHeader>
              <CardTitle>快速操作</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <Link href="/admin/quizzes">
                  <Button variant="outline" className="flex items-center space-x-2">
                    <span>📝</span>
                    <span>管理測驗</span>
                  </Button>
                </Link>
                <Button variant="outline" className="flex items-center space-x-2">
                  <span>📊</span>
                  <span>匯出所有分組</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quizzes List */}
        <Card>
          <CardHeader>
            <CardTitle>測驗列表</CardTitle>
          </CardHeader>
          <CardContent>
            {quizzes.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">尚未建立任何測驗</p>
                <Link href="/admin/quizzes">
                  <Button>建立新測驗</Button>
                </Link>
              </div>
            ) : (
              <div className="grid gap-4">
                {quizzes.map((quiz) => (
                  <div key={quiz.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <h3 className="text-lg font-medium text-gray-900">{quiz.title}</h3>
                          {getStatusBadge(quiz.grouping_status)}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600 mb-3">
                          <div>
                            <span className="font-medium">班級：</span>
                            <span>{quiz.class_title}</span>
                          </div>
                          <div>
                            <span className="font-medium">參與者：</span>
                            <span>{quiz.participants_count}</span>
                          </div>
                          <div>
                            <span className="font-medium">已交卷：</span>
                            <span>{quiz.submissions_count}</span>
                          </div>
                          <div>
                            <span className="font-medium">建立時間：</span>
                            <span>{new Date(quiz.created_at).toLocaleDateString('zh-TW')}</span>
                          </div>
                        </div>

                        {quiz.active_run && (
                          <div className="bg-blue-50 rounded p-3 text-sm">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                              <div>
                                <span className="font-medium">分組數：</span>
                                <span>{quiz.active_run.groups_count}</span>
                              </div>
                              <div>
                                <span className="font-medium">已分配：</span>
                                <span>{quiz.active_run.total_members}</span>
                              </div>
                              <div>
                                <span className="font-medium">分組時間：</span>
                                <span>{new Date(quiz.active_run.created_at).toLocaleDateString('zh-TW')}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col space-y-2 ml-4">
                        <Link href={`/admin/scores/${quiz.id}`}>
                          <Button variant="outline" size="sm" className="w-full">
                            查看分數
                          </Button>
                        </Link>
                        <Link href={`/admin/groups/${quiz.id}`}>
                          <Button variant="outline" size="sm" className="w-full">
                            管理分組
                          </Button>
                        </Link>
                        {quiz.grouping_status !== 'ungrouped' && (
                          <Button variant="outline" size="sm" className="w-full text-xs">
                            匯出分組
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}