import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { classes, quizzes, participants } from '@/lib/db/schema';
import { eq, and, count, isNull } from 'drizzle-orm';
import { z } from 'zod';

const classSchema = z.object({
  title: z.string().min(1, '請輸入班級名稱'),
  expectedSize: z.number().int().positive().optional().nullable(),
  targetGroupSize: z.number().int().positive().optional().nullable(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

    const { id: classId } = await params;

    // Get class details
    const classData = await db
      .select()
      .from(classes)
      .where(and(eq(classes.id, classId), eq(classes.createdBy, session.id), isNull(classes.deletedAt)))
      .limit(1);

    if (classData.length === 0) {
      return NextResponse.json(
        { message: '找不到該班級' },
        { status: 404 }
      );
    }

    // Get related quizzes
    const relatedQuizzes = await db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        isActive: quizzes.isActive,
        createdAt: quizzes.createdAt,
      })
      .from(quizzes)
      .where(and(eq(quizzes.classId, classId), isNull(quizzes.deletedAt)))
      .orderBy(quizzes.createdAt);

    // Get participants count
    const participantsCount = await db
      .select({ count: count(participants.id) })
      .from(participants)
      .innerJoin(quizzes, eq(quizzes.id, participants.quizId))
      .where(and(eq(quizzes.classId, classId), isNull(quizzes.deletedAt)));

    return NextResponse.json({
      class: {
        ...classData[0],
        quizzes: relatedQuizzes,
        participantsCount: participantsCount[0]?.count || 0,
      }
    });

  } catch (error) {
    console.error('Error fetching class:', error);
    return NextResponse.json(
      { message: '取得班級資料失敗' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

    const { id: classId } = await params;
    const body = await request.json();
    const validatedData = classSchema.parse(body);

    // Check if class exists and belongs to admin
    const existingClass = await db
      .select()
      .from(classes)
      .where(and(eq(classes.id, classId), eq(classes.createdBy, session.id), isNull(classes.deletedAt)))
      .limit(1);

    if (existingClass.length === 0) {
      return NextResponse.json(
        { message: '找不到該班級或無權限修改' },
        { status: 404 }
      );
    }

    const updatedClass = await db
      .update(classes)
      .set({
        title: validatedData.title,
        expectedSize: validatedData.expectedSize,
        targetGroupSize: validatedData.targetGroupSize,
      })
      .where(eq(classes.id, classId))
      .returning();

    return NextResponse.json({
      message: '班級更新成功',
      class: updatedClass[0]
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          message: '輸入資料驗證失敗',
          errors: error.issues
        },
        { status: 400 }
      );
    }

    console.error('Error updating class:', error);
    return NextResponse.json(
      { message: '更新班級失敗' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

    const { id: classId } = await params;

    // Check if class exists and belongs to admin
    const existingClass = await db
      .select()
      .from(classes)
      .where(and(eq(classes.id, classId), eq(classes.createdBy, session.id), isNull(classes.deletedAt)))
      .limit(1);

    if (existingClass.length === 0) {
      return NextResponse.json(
        { message: '找不到該班級或無權限刪除' },
        { status: 404 }
      );
    }

    // Check if class has related quizzes
    const relatedQuizzes = await db
      .select()
      .from(quizzes)
      .where(and(eq(quizzes.classId, classId), isNull(quizzes.deletedAt)))
      .limit(1);

    if (relatedQuizzes.length > 0) {
      return NextResponse.json(
        { message: '無法刪除，此班級仍有關聯的測驗' },
        { status: 400 }
      );
    }

    // Soft delete: a hard delete would cascade to the soft-deleted quizzes and erase their data
    await db
      .update(classes)
      .set({ deletedAt: new Date() })
      .where(eq(classes.id, classId));

    return NextResponse.json({
      message: '班級刪除成功'
    });

  } catch (error) {
    console.error('Error deleting class:', error);
    return NextResponse.json(
      { message: '刪除班級失敗' },
      { status: 500 }
    );
  }
}