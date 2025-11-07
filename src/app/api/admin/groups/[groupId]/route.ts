import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { groups, groupingRuns, quizzes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  notes: z.string().max(500).optional(),
  order_index: z.number().min(1).optional(),
});

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { groupId } = await params;
  try {
    const session = await getSession();

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

    // Verify group exists and admin has permission
    const groupData = await db
      .select({
        id: groups.id,
        quiz_id: groups.quizId,
        name: groups.name,
        notes: groups.notes,
        order_index: groups.orderIndex,
        created_by: quizzes.createdBy,
      })
      .from(groups)
      .innerJoin(groupingRuns, eq(groups.groupingRunId, groupingRuns.id))
      .innerJoin(quizzes, eq(groups.quizId, quizzes.id))
      .where(eq(groups.id, groupId))
      .limit(1);

    if (groupData.length === 0) {
      return NextResponse.json(
        { message: '分組不存在' },
        { status: 404 }
      );
    }

    if (groupData[0].created_by !== session.id) {
      return NextResponse.json(
        { message: '無權限編輯此分組' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const updates = updateGroupSchema.parse(body);

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { message: '沒有要更新的資料' },
        { status: 400 }
      );
    }

    // Check if order_index conflicts with existing groups in same quiz
    if (updates.order_index !== undefined) {
      const conflictingGroup = await db
        .select({ id: groups.id })
        .from(groups)
        .where(and(
          eq(groups.quizId, groupData[0].quiz_id),
          eq(groups.orderIndex, updates.order_index),
          // ne(groups.id, groupId) - exclude current group
        ))
        .limit(1);

      if (conflictingGroup.length > 0 && conflictingGroup[0].id !== groupId) {
        return NextResponse.json(
          { message: '該排序位置已被其他組別使用' },
          { status: 400 }
        );
      }
    }

    // Update the group
    const updatedGroup = await db
      .update(groups)
      .set({
        ...(updates.name && { name: updates.name }),
        ...(updates.notes !== undefined && { notes: updates.notes }),
        ...(updates.order_index && { orderIndex: updates.order_index }),
      })
      .where(eq(groups.id, groupId))
      .returning();

    return NextResponse.json({
      message: '分組更新成功',
      group: {
        id: updatedGroup[0].id,
        name: updatedGroup[0].name,
        notes: updatedGroup[0].notes,
        order_index: updatedGroup[0].orderIndex,
      },
    });

  } catch (error) {
    console.error('Error updating group:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          message: '資料格式錯誤',
          errors: error.issues.map(e => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: '更新分組失敗' },
      { status: 500 }
    );
  }
}