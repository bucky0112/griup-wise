import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { groupingManager } from '@/lib/grouping/manager';
import { validateGroupingConfig } from '@/lib/grouping/config';
import { db, quizzes } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const autoGroupingSchema = z.object({
  target_group_size: z.number().int().min(1).max(50),
  include_unsubmitted: z.boolean().default(false),
  min_groups: z.number().int().min(1).optional(),
  max_groups: z.number().int().min(1).optional(),
  tie_breaker: z.enum(['submission_time', 'student_no']).default('submission_time'),
  reason: z.string().optional().default('Manual admin trigger'),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
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
        createdBy: quizzes.createdBy,
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

    if (quiz[0].createdBy !== session.id) {
      return NextResponse.json(
        { message: '無權限管理此測驗' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const configInput = autoGroupingSchema.parse(body);

    // Validate and normalize the grouping configuration
    const config = validateGroupingConfig({
      target_group_size: configInput.target_group_size,
      include_unsubmitted: configInput.include_unsubmitted,
      min_groups: configInput.min_groups,
      max_groups: configInput.max_groups,
      tie_breaker: configInput.tie_breaker,
      sort_order: 'desc',
    });

    // Trigger manual grouping
    const result = await groupingManager.manualGroup(
      quizId,
      session.id,
      config,
      configInput.reason
    );

    if (!result.success) {
      return NextResponse.json(
        {
          message: '自動分組失敗',
          reason: result.triggerEvaluation?.reason || 'Unknown error',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: '自動分組完成',
      runId: result.runId,
      groupsCreated: result.groupsCreated,
      totalMembers: result.totalMembers,
      config: result.metadata.config,
      timestamp: result.metadata.timestamp,
    });

  } catch (error) {
    console.error('Error in auto grouping:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          message: '分組設定格式錯誤',
          errors: error.issues.map(e => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: '自動分組失敗，請稍後再試' },
      { status: 500 }
    );
  }
}