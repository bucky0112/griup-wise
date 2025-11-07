import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import GroupManagement from '@/components/admin/GroupManagement';

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
        <GroupManagement quizId={quizId} initialData={groupsData} />
      </div>
    </div>
  );
}