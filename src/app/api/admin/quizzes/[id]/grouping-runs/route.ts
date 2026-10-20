import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { quizzes, groupingRuns, groups, admins, groupMembers } from '@/lib/db/schema';
import { and, eq, count, isNull } from 'drizzle-orm';

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


    // Verify quiz exists and is owned by this admin
    const quiz = await db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        created_by: quizzes.createdBy,
      })
      .from(quizzes)
      .where(and(eq(quizzes.id, quizId), isNull(quizzes.deletedAt)))
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

    // Get all grouping runs for this quiz
    const runs = await db
      .select({
        id: groupingRuns.id,
        created_at: groupingRuns.createdAt,
        created_by: groupingRuns.createdBy,
        strategy: groupingRuns.strategy,
        config: groupingRuns.config,
        status: groupingRuns.status,
        creator_name: admins.name,
      })
      .from(groupingRuns)
      .innerJoin(admins, eq(groupingRuns.createdBy, admins.id))
      .where(eq(groupingRuns.quizId, quizId))
      .orderBy(groupingRuns.createdAt);

    // Get group counts for each run
    const runsWithStats = await Promise.all(
      runs.map(async (run) => {
        // Get groups count
        const groupsResult = await db
          .select({ count: count() })
          .from(groups)
          .where(eq(groups.groupingRunId, run.id));

        const groupsCount = groupsResult[0]?.count || 0;

        // Get total members count by joining with groupMembers
        const membersResult = await db
          .select({ count: count() })
          .from(groupMembers)
          .innerJoin(groups, eq(groupMembers.groupId, groups.id))
          .where(eq(groups.groupingRunId, run.id));

        const totalMembers = membersResult[0]?.count || 0;

        return {
          id: run.id,
          created_at: run.created_at,
          created_by_name: run.creator_name,
          status: run.status,
          config: run.config,
          groups_count: groupsCount,
          total_members: totalMembers,
        };
      })
    );

    return NextResponse.json({
      runs: runsWithStats,
    });

  } catch (error) {
    console.error('Error fetching grouping runs:', error);
    return NextResponse.json(
      { message: '取得分組歷程失敗' },
      { status: 500 }
    );
  }
}