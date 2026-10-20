import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { classes, db, quizzes } from '@/lib/db';
import type { UserSession } from '@/lib/auth';
import { resetGroupingTables, seedQuiz } from '@/test/grouping-fixtures';

let currentSession: UserSession | null = null;
vi.mock('@/lib/session', () => ({
  getSession: async () => currentSession,
  createSession: async () => {},
}));

function asAdmin(adminId: string) {
  currentSession = { type: 'admin', id: adminId, name: 'Admin', email: `${adminId}@example.com` };
}

async function classOf(quizId: string) {
  const [quiz] = await db.select({ classId: quizzes.classId }).from(quizzes).where(eq(quizzes.id, quizId));
  return quiz.classId;
}

async function deleteQuiz(quizId: string) {
  const { DELETE } = await import('@/app/api/admin/quizzes/[id]/route');
  await DELETE(
    new NextRequest('http://localhost/api/admin/quizzes/x', { method: 'DELETE' }),
    { params: Promise.resolve({ id: quizId }) }
  );
}

async function deleteClass(classId: string) {
  const { DELETE } = await import('@/app/api/admin/classes/[id]/route');
  const response = await DELETE(
    new NextRequest('http://localhost/api/admin/classes/x', { method: 'DELETE' }),
    { params: Promise.resolve({ id: classId }) }
  );
  return { status: response.status, body: await response.json() };
}

async function getClass(classId: string) {
  const { GET } = await import('@/app/api/admin/classes/[id]/route');
  const response = await GET(
    new NextRequest('http://localhost/api/admin/classes/x'),
    { params: Promise.resolve({ id: classId }) }
  );
  return { status: response.status, body: await response.json() };
}

async function classDeletedAt(classId: string) {
  const [klass] = await db.select({ deletedAt: classes.deletedAt }).from(classes).where(eq(classes.id, classId));
  return klass.deletedAt;
}

describe('DELETE /api/admin/classes/[id]', () => {
  beforeEach(async () => {
    currentSession = null;
    await resetGroupingTables();
  });

  it('soft-deletes a class whose only quiz is deleted and keeps both rows', async () => {
    const { adminId, quizId } = await seedQuiz();
    const classId = await classOf(quizId);
    asAdmin(adminId);
    await deleteQuiz(quizId);

    const response = await deleteClass(classId);

    expect(response).toEqual({ status: 200, body: { message: '班級刪除成功' } });
    expect(await classDeletedAt(classId)).toBeInstanceOf(Date);
    expect(await db.select().from(quizzes).where(eq(quizzes.id, quizId))).toHaveLength(1);
  });

  it('refuses a class that still has a live quiz', async () => {
    const { adminId, quizId } = await seedQuiz();
    const classId = await classOf(quizId);
    asAdmin(adminId);

    const response = await deleteClass(classId);

    expect(response).toEqual({ status: 400, body: { message: '無法刪除，此班級仍有關聯的測驗' } });
    expect(await classDeletedAt(classId)).toBeNull();
  });

  it('treats a deleted class as missing', async () => {
    const { adminId, quizId } = await seedQuiz();
    const classId = await classOf(quizId);
    asAdmin(adminId);
    await deleteQuiz(quizId);
    await deleteClass(classId);

    expect((await getClass(classId)).status).toBe(404);
    expect((await deleteClass(classId)).status).toBe(404);
  });

  it('leaves deleted quizzes and classes out of the admin list APIs', async () => {
    const { adminId, quizId } = await seedQuiz();
    const classId = await classOf(quizId);
    const [liveClass] = await db.insert(classes).values({ title: 'Live class', createdBy: adminId }).returning();
    const [liveQuiz] = await db
      .insert(quizzes)
      .values({ title: 'Live quiz', classId: liveClass.id, createdBy: adminId })
      .returning();
    asAdmin(adminId);
    await deleteQuiz(quizId);
    await deleteClass(classId);

    const { GET: listQuizzes } = await import('@/app/api/admin/quizzes/route');
    const { GET: listClasses } = await import('@/app/api/admin/classes/route');
    const quizList = await (await listQuizzes()).json();
    const classList = await (await listClasses()).json();

    expect(quizList.quizzes.map((quiz: { id: string }) => quiz.id)).toEqual([liveQuiz.id]);
    expect(classList.classes.map((klass: { id: string; quizzesCount: number }) => [klass.id, klass.quizzesCount])).toEqual([
      [liveClass.id, 1],
    ]);
  });

  it('refuses to create a quiz in a deleted class', async () => {
    const { adminId, quizId } = await seedQuiz();
    const classId = await classOf(quizId);
    asAdmin(adminId);
    await deleteQuiz(quizId);
    await deleteClass(classId);

    const { POST } = await import('@/app/api/admin/quizzes/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/quizzes', {
        method: 'POST',
        body: JSON.stringify({ title: 'New quiz', classId }),
      })
    );

    expect(response.status).toBe(400);
    expect(await db.select().from(quizzes).where(eq(quizzes.classId, classId))).toHaveLength(1);
  });
});
