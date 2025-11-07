import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { quizzes, classes, participants, submissions, groupingRuns, groups } from '@/lib/db/schema';
import { eq, and, count, isNotNull } from 'drizzle-orm';

export async function GET() {
  try {
    const session = await getSession();

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

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
      .where(eq(quizzes.createdBy, session.id))
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
          created_at: quiz.created_at,
          grouping_status: groupingStatus,
          active_run: activeRun.length > 0 ? {
            id: activeRun[0].id,
            created_at: activeRun[0].created_at,
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

    return NextResponse.json({
      statistics: {
        total_quizzes: totalQuizzes,
        grouped_quizzes: groupedQuizzes,
        public_groups: publicGroups,
      },
      quizzes: quizData,
    });

  } catch (error) {
    console.error('Error fetching groups overview:', error);
    return NextResponse.json(
      { message: '取得分組總覽失敗' },
      { status: 500 }
    );
  }
}