import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { classes, quizzes, participants } from '@/lib/db/schema';
import { eq, count } from 'drizzle-orm';
import { z } from 'zod';

const classSchema = z.object({
  title: z.string().min(1, '請輸入班級名稱'),
  expectedSize: z.number().int().positive().optional().nullable(),
  targetGroupSize: z.number().int().positive().optional().nullable(),
});

export async function GET() {
  try {
    const session = await getSession();

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

    // Get classes with statistics
    const classesWithStats = await db
      .select({
        id: classes.id,
        title: classes.title,
        expectedSize: classes.expectedSize,
        targetGroupSize: classes.targetGroupSize,
        createdAt: classes.createdAt,
        quizzesCount: count(quizzes.id),
      })
      .from(classes)
      .leftJoin(quizzes, eq(quizzes.classId, classes.id))
      .where(eq(classes.createdBy, session.id))
      .groupBy(classes.id, classes.title, classes.expectedSize, classes.targetGroupSize, classes.createdAt)
      .orderBy(classes.createdAt);

    // Get participants count for each class
    const classesWithParticipants = await Promise.all(
      classesWithStats.map(async (classItem) => {
        const participantsCount = await db
          .select({ count: count(participants.id) })
          .from(participants)
          .innerJoin(quizzes, eq(quizzes.id, participants.quizId))
          .where(eq(quizzes.classId, classItem.id));

        return {
          ...classItem,
          participantsCount: participantsCount[0]?.count || 0,
        };
      })
    );

    return NextResponse.json({ classes: classesWithParticipants });

  } catch (error) {
    console.error('Error fetching classes:', error);
    return NextResponse.json(
      { message: '取得班級列表失敗' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = classSchema.parse(body);

    const newClass = await db
      .insert(classes)
      .values({
        title: validatedData.title,
        expectedSize: validatedData.expectedSize,
        targetGroupSize: validatedData.targetGroupSize,
        createdBy: session.id,
      })
      .returning();

    return NextResponse.json(
      {
        message: '班級建立成功',
        class: newClass[0]
      },
      { status: 201 }
    );

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

    console.error('Error creating class:', error);
    return NextResponse.json(
      { message: '建立班級失敗' },
      { status: 500 }
    );
  }
}