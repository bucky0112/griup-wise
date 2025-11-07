import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

interface Member {
  participant_id: string;
  display_name: string;
  student_no: string;
  total_score: number | null;
  rank_index: number;
}

interface Group {
  id: string;
  name: string;
  order_index: number;
  notes: string;
  members: Member[];
}

interface UngroupedParticipant {
  id: string;
  display_name: string;
  student_no: string;
  reason: 'excluded' | 'unsubmitted';
}

interface RunInfo {
  id: string;
  created_at: string;
  config: {
    target_group_size: number;
    include_unsubmitted: boolean;
    min_groups?: number;
    max_groups?: number;
    sort_by: string;
  };
  status: string;
}

interface GroupsData {
  run_info: RunInfo | null;
  groups: Group[];
  ungrouped_participants: UngroupedParticipant[];
}

interface QuizInfo {
  id: string;
  title: string;
}

async function fetchQuizInfo(quizId: string): Promise<QuizInfo> {
  const { cookies } = await import('next/headers');

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/quizzes/${quizId}/quiz-info`,
    {
      cache: 'no-store',
      headers: {
        'Cookie': (await cookies()).toString(),
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch quiz info');
  }

  const data = await response.json();
  return data.quiz;
}

async function fetchGroupsData(quizId: string): Promise<GroupsData> {
  const { cookies } = await import('next/headers');

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/admin/quizzes/${quizId}/groups`,
    {
      cache: 'no-store',
      headers: {
        'Cookie': (await cookies()).toString(),
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch groups data');
  }

  return response.json();
}

function calculateGroupStats(groups: Group[]) {
  const totalMembers = groups.reduce((sum, group) => sum + group.members.length, 0);
  const avgGroupSize = totalMembers > 0 ? totalMembers / groups.length : 0;

  const groupSizes = groups.map(g => g.members.length);
  const minSize = Math.min(...groupSizes);
  const maxSize = Math.max(...groupSizes);

  const groupAverages = groups.map(group => {
    const scores = group.members.filter(m => m.total_score !== null).map(m => m.total_score!);
    return scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
  });

  const avgScore = groupAverages.reduce((sum, avg) => sum + avg, 0) / groupAverages.length;

  return {
    totalMembers,
    avgGroupSize,
    minSize,
    maxSize,
    sizeVariance: maxSize - minSize,
    avgScore,
  };
}

function getMemberStatusBadge(member: Member) {
  if (member.total_score === null) {
    return <Badge variant="destructive">未交卷</Badge>;
  } else if (member.total_score >= 50) {
    return <Badge variant="default">高分</Badge>;
  } else if (member.total_score >= 30) {
    return <Badge variant="secondary">中等</Badge>;
  } else {
    return <Badge variant="outline">待加強</Badge>;
  }
}

export default async function GroupsDetailPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id: quizId } = await params;

  const session = await getSession();

  if (!session || session.type !== 'admin') {
    redirect('/login');
  }

  let quizInfo: QuizInfo;
  let groupsData: GroupsData;

  try {
    [quizInfo, groupsData] = await Promise.all([
      fetchQuizInfo(quizId),
      fetchGroupsData(quizId)
    ]);
  } catch (error) {
    console.error('Error fetching data:', error);
    notFound();
  }

  const stats = groupsData.groups.length > 0 ? calculateGroupStats(groupsData.groups) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                分組管理：{quizInfo.title}
              </h1>
              {groupsData.run_info && (
                <p className="text-gray-600">
                  分組時間：{new Date(groupsData.run_info.created_at).toLocaleString('zh-TW')}
                </p>
              )}
            </div>
            <div className="flex space-x-4">
              <Link href="/admin/groups">
                <Button variant="outline">返回分組總覽</Button>
              </Link>
              <Link href={`/admin/scores/${quizId}`}>
                <Button variant="outline">查看分數</Button>
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
        {/* No Groups State */}
        {!groupsData.run_info || groupsData.groups.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <div className="text-gray-500 mb-4">
                <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">尚未建立分組</h3>
              <p className="text-gray-600 mb-6">
                為此測驗建立分組以開始管理學生分配
              </p>
              <div className="flex justify-center space-x-4">
                <Button>
                  自動分組
                </Button>
                <Button variant="outline">
                  手動分組
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Statistics Overview */}
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">總組數</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{groupsData.groups.length}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">總成員</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.totalMembers}</div>
                    <p className="text-xs text-gray-500">平均 {stats.avgGroupSize.toFixed(1)} 人/組</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">組別平衡</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {stats.sizeVariance === 0 ? '完美' : `±${stats.sizeVariance}`}
                    </div>
                    <p className="text-xs text-gray-500">{stats.minSize}-{stats.maxSize} 人</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">平均分數</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.avgScore.toFixed(1)}</div>
                    <p className="text-xs text-gray-500">各組平均</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Group Configuration Info */}
            {groupsData.run_info && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>分組配置</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="font-medium">目標人數：</span>
                      <span>{groupsData.run_info.config.target_group_size} 人/組</span>
                    </div>
                    <div>
                      <span className="font-medium">排序方式：</span>
                      <span>{groupsData.run_info.config.sort_by === 'total_score' ? '總分' : '其他'}</span>
                    </div>
                    <div>
                      <span className="font-medium">未交卷者：</span>
                      <span>{groupsData.run_info.config.include_unsubmitted ? '包含' : '不包含'}</span>
                    </div>
                    <div>
                      <span className="font-medium">狀態：</span>
                      <Badge variant={groupsData.run_info.status === 'active' ? 'default' : 'secondary'}>
                        {groupsData.run_info.status === 'active' ? '活躍' : '已封存'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Groups List */}
            <div className="space-y-6">
              {groupsData.groups.map((group) => (
                <Card key={group.id}>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle className="text-lg">{group.name}</CardTitle>
                        <p className="text-sm text-gray-600">
                          {group.members.length} 位成員
                          {group.members.length > 0 && (
                            ` · 平均分數 ${
                              group.members
                                .filter(m => m.total_score !== null)
                                .reduce((sum, m) => sum + m.total_score!, 0) /
                              group.members.filter(m => m.total_score !== null).length || 0
                            }`
                          )}
                        </p>
                      </div>
                      <div className="flex space-x-2">
                        <Button variant="outline" size="sm">
                          編輯組別
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {group.members.length === 0 ? (
                      <p className="text-gray-500 text-center py-4">此組別暫無成員</p>
                    ) : (
                      <div className="grid gap-3">
                        {group.members
                          .sort((a, b) => a.rank_index - b.rank_index)
                          .map((member) => (
                          <div
                            key={member.participant_id}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                          >
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-sm font-medium">
                                {member.rank_index}
                              </div>
                              <div>
                                <div className="font-medium">{member.display_name}</div>
                                <div className="text-sm text-gray-600">{member.student_no}</div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-3">
                              {member.total_score !== null && (
                                <span className="text-sm font-mono">
                                  {member.total_score.toFixed(1)} 分
                                </span>
                              )}
                              {getMemberStatusBadge(member)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Ungrouped Participants */}
            {groupsData.ungrouped_participants.length > 0 && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-lg text-orange-600">
                    未分組成員 ({groupsData.ungrouped_participants.length} 位)
                  </CardTitle>
                  <p className="text-sm text-gray-600">
                    以下參與者未被分配到任何組別
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {groupsData.ungrouped_participants.map((participant) => (
                      <div
                        key={participant.id}
                        className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-200"
                      >
                        <div>
                          <div className="font-medium">{participant.display_name}</div>
                          <div className="text-sm text-gray-600">{participant.student_no}</div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <Badge variant={participant.reason === 'unsubmitted' ? 'destructive' : 'secondary'}>
                            {participant.reason === 'unsubmitted' ? '未交卷' : '被排除'}
                          </Badge>
                          <Button variant="outline" size="sm">
                            手動分組
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Action Buttons */}
            <div className="mt-8 flex justify-center space-x-4">
              <Button>
                重新分組
              </Button>
              <Button variant="outline">
                匯出分組名單
              </Button>
              <Button variant="outline">
                公開分組
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}