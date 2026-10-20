import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, questions, quizzes, submissions } from '@/lib/db';
import type { UserSession } from '@/lib/auth';
import { resetGroupingTables, seedQuiz, submit } from '@/test/grouping-fixtures';

let currentSession: UserSession | null = null;
vi.mock('@/lib/session', () => ({
  getSession: async () => currentSession,
  createSession: async () => {},
}));

function asAdmin(adminId: string) {
  currentSession = { type: 'admin', id: adminId, name: 'Admin', email: `${adminId}@example.com` };
}

async function deleteQuiz(quizId: string) {
  const { DELETE } = await import('@/app/api/admin/quizzes/[id]/route');
  const response = await DELETE(
    new NextRequest('http://localhost/api/admin/quizzes/x', { method: 'DELETE' }),
    { params: Promise.resolve({ id: quizId }) }
  );
  return { status: response.status, body: await response.json() };
}

async function studentLogin(quizId: string) {
  const { POST } = await import('@/app/api/auth/student/route');
  const response = await POST(
    new NextRequest('http://localhost/api/auth/student', {
      method: 'POST',
      body: JSON.stringify({ quizId, displayName: '王小明', studentNo: 'S001' }),
    })
  );
  return { status: response.status, body: await response.json() };
}

async function storedQuiz(quizId: string) {
  const [quiz] = await db
    .select({ isActive: quizzes.isActive, deletedAt: quizzes.deletedAt })
    .from(quizzes)
    .where(eq(quizzes.id, quizId));
  return quiz;
}

describe('DELETE /api/admin/quizzes/[id]', () => {
  beforeEach(async () => {
    currentSession = null;
    await resetGroupingTables();
  });

  it('soft-deletes and deactivates the quiz while keeping its submissions', async () => {
    const { adminId, quizId } = await seedQuiz();
    await submit(quizId, 80);
    asAdmin(adminId);

    const response = await deleteQuiz(quizId);

    expect(response).toEqual({ status: 200, body: { message: '測驗已刪除' } });
    const quiz = await storedQuiz(quizId);
    expect(quiz.isActive).toBe(false);
    expect(quiz.deletedAt).toBeInstanceOf(Date);
    expect(await db.select().from(submissions).where(eq(submissions.quizId, quizId))).toHaveLength(1);
  });

  it('refuses another admin with 403 and leaves the quiz undeleted', async () => {
    const { quizId } = await seedQuiz();
    asAdmin('00000000-0000-4000-8000-000000000000');

    const response = await deleteQuiz(quizId);

    expect(response).toEqual({ status: 403, body: { message: '無權限修改此測驗' } });
    expect((await storedQuiz(quizId)).deletedAt).toBeNull();
  });

  it('answers 404 when the quiz is already deleted', async () => {
    const { adminId, quizId } = await seedQuiz();
    asAdmin(adminId);
    await deleteQuiz(quizId);

    const response = await deleteQuiz(quizId);

    expect(response).toEqual({ status: 404, body: { message: '測驗不存在' } });
  });

  it('refuses to add a question to a deleted quiz', async () => {
    const { adminId, quizId } = await seedQuiz();
    asAdmin(adminId);
    await deleteQuiz(quizId);

    const { POST } = await import('@/app/api/quizzes/[id]/questions/route');
    const response = await POST(
      new NextRequest('http://localhost/api/quizzes/x/questions', {
        method: 'POST',
        body: JSON.stringify({ prompt: '1 + 1 = ?', type: 'single', score: 5, options: ['2', '3'], correctAnswers: ['2'], orderIndex: 1 }),
      }),
      { params: Promise.resolve({ id: quizId }) }
    );

    expect(response.status).toBe(404);
    expect(await db.select().from(questions).where(eq(questions.quizId, quizId))).toHaveLength(0);
  });

  it('refuses to re-activate a deleted quiz', async () => {
    const { adminId, quizId } = await seedQuiz();
    asAdmin(adminId);
    await deleteQuiz(quizId);

    const { PATCH } = await import('@/app/api/admin/quizzes/[id]/route');
    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/quizzes/x', { method: 'PATCH', body: JSON.stringify({ is_active: true }) }),
      { params: Promise.resolve({ id: quizId }) }
    );

    expect(response.status).toBe(404);
    expect((await storedQuiz(quizId)).isActive).toBe(false);
  });

  it('refuses student login after the quiz is deleted', async () => {
    const { adminId, quizId } = await seedQuiz();
    expect((await studentLogin(quizId)).status).toBe(200);
    asAdmin(adminId);

    await deleteQuiz(quizId);

    expect(await studentLogin(quizId)).toEqual({
      status: 401,
      body: { message: '測驗不存在或未開放，請檢查測驗代碼' },
    });
  });
});
