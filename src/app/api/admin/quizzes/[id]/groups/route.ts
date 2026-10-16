import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import {
  quizzes,
  groupingRuns,
  groups,
  groupMembers,
  participants,
  submissions
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ id: string }>;
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

    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('run_id');

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
        return NextResponse.json(
          { message: '指定的分組記錄不存在' },
          { status: 404 }
        );
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
        return NextResponse.json({
          run_info: null,
          groups: [],
          ungrouped_participants: [],
        });
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
        reason: submittedParticipantIds.has(participant.id) ? 'excluded' : 'unsubmitted',
      }));

    return NextResponse.json({
      run_info: {
        id: targetRun.id,
        created_at: targetRun.created_at,
        config: targetRun.config,
        strategy: targetRun.strategy,
        status: targetRun.status,
      },
      groups: groupsWithMembers,
      ungrouped_participants: ungroupedParticipants,
    });

  } catch (error) {
    console.error('Error fetching groups:', error);
    return NextResponse.json(
      { message: '取得分組資料失敗' },
      { status: 500 }
    );
  }
}