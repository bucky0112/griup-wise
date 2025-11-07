import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import {
  quizzes,
  groups,
  groupMembers,
  participants,
  groupingRuns
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET() {
  try {
    const session = await getSession();

    if (!session || session.type !== 'student') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

    const { quizId, participantId } = session;

    // Verify quiz exists and allows public group viewing
    const quiz = await db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        show_group_publicly: quizzes.showGroupPublicly,
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

    if (!quiz[0].show_group_publicly) {
      return NextResponse.json({
        my_group: null,
        message: '分組尚未公開',
      });
    }

    // Find student's group in active grouping run
    const studentGroupData = await db
      .select({
        group_id: groups.id,
        group_name: groups.name,
        rank_index: groupMembers.rankIndex,
      })
      .from(groupMembers)
      .innerJoin(groups, eq(groupMembers.groupId, groups.id))
      .innerJoin(groupingRuns, eq(groups.groupingRunId, groupingRuns.id))
      .where(and(
        eq(groupMembers.participantId, participantId),
        eq(groups.quizId, quizId),
        eq(groupingRuns.status, 'active')
      ))
      .limit(1);

    if (studentGroupData.length === 0) {
      // Student is not in any group
      return NextResponse.json({
        my_group: null,
        message: '您尚未被分配到任何組別',
      });
    }

    const studentGroup = studentGroupData[0];

    // Get all members of this group
    const groupMembersData = await db
      .select({
        display_name: participants.displayName,
        student_no: participants.studentNo,
        rank_index: groupMembers.rankIndex,
      })
      .from(groupMembers)
      .innerJoin(participants, eq(groupMembers.participantId, participants.id))
      .where(eq(groupMembers.groupId, studentGroup.group_id))
      .orderBy(groupMembers.rankIndex);

    return NextResponse.json({
      my_group: {
        name: studentGroup.group_name,
        my_rank_in_group: studentGroup.rank_index,
        members: groupMembersData.map(member => ({
          display_name: member.display_name,
          student_no: member.student_no,
        })),
      },
    });

  } catch (error) {
    console.error('Error fetching student groups:', error);
    return NextResponse.json(
      { message: '取得分組資料失敗' },
      { status: 500 }
    );
  }
}