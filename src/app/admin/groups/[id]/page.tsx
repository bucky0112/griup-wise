import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { resolveDefaultGroupSize } from '@/lib/grouping/default-group-size';
import GroupManagement from '@/components/admin/GroupManagement';
import { db } from '@/lib/db';
import {
  quizzes,
  classes,
  groupingRuns,
  groups,
  groupMembers,
  participants,
  submissions
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

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
  strategy: string;
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
  showGroupPublicly: boolean;
  defaultGroupSize: number;
}

async function fetchQuizInfo(quizId: string, adminId: string): Promise<QuizInfo> {
  // Get quiz info with class name
  const quiz = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      isActive: quizzes.isActive,
      showGroupPublicly: quizzes.showGroupPublicly,
      className: classes.title,
      classTargetGroupSize: classes.targetGroupSize,
    })
    .from(quizzes)
    .innerJoin(classes, eq(quizzes.classId, classes.id))
    .where(and(eq(quizzes.id, quizId), eq(quizzes.createdBy, adminId)))
    .limit(1);

  if (quiz.length === 0) {
    throw new Error('測驗不存在或您沒有權限管理此測驗');
  }

  return { ...quiz[0], defaultGroupSize: resolveDefaultGroupSize(quiz[0].classTargetGroupSize) };
}

async function fetchGroupsData(quizId: string, adminId: string, runId?: string): Promise<GroupsData> {
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
    throw new Error('測驗不存在');
  }

  if (quiz[0].created_by !== adminId) {
    throw new Error('無權限查看此測驗');
  }

  // Get the target grouping run (either specified or active)
  let targetRun;
  if (runId) {
    // Get specific run
    const specificRun = await db
      .select({
        id: groupingRuns.id,
        created_at: groupingRuns.createdAt,
        strategy: groupingRuns.strategy,
        config: groupingRuns.config,
        status: groupingRuns.status,
      })
      .from(groupingRuns)
      .where(and(
        eq(groupingRuns.id, runId),
        eq(groupingRuns.quizId, quizId)
      ))
      .limit(1);

    if (specificRun.length === 0) {
      throw new Error('指定的分組記錄不存在');
    }

    targetRun = specificRun[0];
  } else {
    // Get active run
    const activeRun = await db
      .select({
        id: groupingRuns.id,
        created_at: groupingRuns.createdAt,
        strategy: groupingRuns.strategy,
        config: groupingRuns.config,
        status: groupingRuns.status,
      })
      .from(groupingRuns)
      .where(and(
        eq(groupingRuns.quizId, quizId),
        eq(groupingRuns.status, 'active')
      ))
      .limit(1);

    if (activeRun.length === 0) {
      return {
        run_info: null,
        groups: [],
        ungrouped_participants: [],
      };
    }

    targetRun = activeRun[0];
  }

  // Get groups for this run
  const groupsData = await db
    .select({
      id: groups.id,
      name: groups.name,
      order_index: groups.orderIndex,
      notes: groups.notes,
    })
    .from(groups)
    .where(eq(groups.groupingRunId, targetRun.id))
    .orderBy(groups.orderIndex);

  // Get members for each group
  const groupsWithMembers = await Promise.all(
    groupsData.map(async (group) => {
      const members = await db
        .select({
          participant_id: groupMembers.participantId,
          rank_index: groupMembers.rankIndex,
          display_name: participants.displayName,
          student_no: participants.studentNo,
          total_score: submissions.totalScore,
        })
        .from(groupMembers)
        .innerJoin(participants, eq(groupMembers.participantId, participants.id))
        .leftJoin(submissions, and(
          eq(submissions.participantId, participants.id),
          eq(submissions.quizId, quizId)
        ))
        .where(eq(groupMembers.groupId, group.id))
        .orderBy(groupMembers.rankIndex);

      return {
        id: group.id,
        name: group.name,
        order_index: group.order_index,
        notes: group.notes || '',
        members: members.map(member => ({
          participant_id: member.participant_id,
          display_name: member.display_name,
          student_no: member.student_no,
          total_score: member.total_score ? parseFloat(member.total_score) : null,
          rank_index: member.rank_index,
        })),
      };
    })
  );

  // Get ungrouped participants (those not in any group for this run)
  const groupedParticipantIds = new Set(
    groupsWithMembers.flatMap(group =>
      group.members.map(member => member.participant_id)
    )
  );

  const allParticipants = await db
    .select({
      id: participants.id,
      display_name: participants.displayName,
      student_no: participants.studentNo,
      created_at: participants.createdAt,
    })
    .from(participants)
    .where(eq(participants.quizId, quizId));

  const submissionData = await db
    .select({
      participant_id: submissions.participantId,
    })
    .from(submissions)
    .where(eq(submissions.quizId, quizId));

  const submittedParticipantIds = new Set(
    submissionData.map(s => s.participant_id)
  );

  const ungroupedParticipants = allParticipants
    .filter(participant => !groupedParticipantIds.has(participant.id))
    .map(participant => ({
      id: participant.id,
      display_name: participant.display_name,
      student_no: participant.student_no,
      reason: submittedParticipantIds.has(participant.id) ? 'excluded' as const : 'unsubmitted' as const,
    }));

  return {
    run_info: {
      id: targetRun.id,
      created_at: targetRun.created_at.toISOString(),
      config: targetRun.config as {
        target_group_size: number;
        include_unsubmitted: boolean;
        min_groups?: number;
        max_groups?: number;
        sort_by: string;
      },
      strategy: targetRun.strategy,
      status: targetRun.status,
    },
    groups: groupsWithMembers,
    ungrouped_participants: ungroupedParticipants,
  };
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
      fetchQuizInfo(quizId, session.id),
      fetchGroupsData(quizId, session.id)
    ]);
  } catch (error) {
    console.error('Error fetching data:', error);
    notFound();
  }

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
        <GroupManagement
          quizId={quizId}
          quizTitle={quizInfo.title}
          initialShowGroupPublicly={quizInfo.showGroupPublicly}
          defaultGroupSize={quizInfo.defaultGroupSize}
          initialData={groupsData}
        />
      </div>
    </div>
  );
}