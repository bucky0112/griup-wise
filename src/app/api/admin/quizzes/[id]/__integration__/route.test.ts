import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, quizzes } from '@/lib/db';
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

async function patchQuiz(quizId: string, body: unknown) {
  const { PATCH } = await import('@/app/api/admin/quizzes/[id]/route');
  const response = await PATCH(
    new NextRequest('http://localhost/api/admin/quizzes/x', { method: 'PATCH', body: JSON.stringify(body) }),
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

async function isActive(quizId: string) {
  const [quiz] = await db.select({ isActive: quizzes.isActive }).from(quizzes).where(eq(quizzes.id, quizId));
  return quiz.isActive;
}

describe('PATCH /api/admin/quizzes/[id] is_active', () => {
  beforeEach(async () => {
    currentSession = null;
    await resetGroupingTables();
  });

  it('lets the owner activate an inactive quiz so students can log in', async () => {
    const { adminId, quizId } = await seedQuiz();
    await db.update(quizzes).set({ isActive: false }).where(eq(quizzes.id, quizId));
    expect((await studentLogin(quizId)).status).toBe(401);
    asAdmin(adminId);

    const response = await patchQuiz(quizId, { is_active: true });

    expect(response.status).toBe(200);
    expect(response.body.quiz.is_active).toBe(true);
    expect((await studentLogin(quizId)).status).toBe(200);
  });

  it('lets the owner deactivate an active quiz so student login is refused', async () => {
    const { adminId, quizId } = await seedQuiz();
    asAdmin(adminId);

    const response = await patchQuiz(quizId, { is_active: false });

    expect(response.status).toBe(200);
    expect(response.body.quiz.is_active).toBe(false);
    expect(await studentLogin(quizId)).toEqual({
      status: 401,
      body: { message: '測驗不存在或未開放，請檢查測驗代碼' },
    });
  });

  it('refuses another admin with 403 and leaves the quiz unchanged', async () => {
    const { quizId } = await seedQuiz();
    await db.update(quizzes).set({ isActive: false }).where(eq(quizzes.id, quizId));
    asAdmin('00000000-0000-4000-8000-000000000000');

    const response = await patchQuiz(quizId, { is_active: true });

    expect(response.status).toBe(403);
    expect(await isActive(quizId)).toBe(false);
  });

  it('rejects a non-boolean is_active with 400', async () => {
    const { adminId, quizId } = await seedQuiz();
    asAdmin(adminId);

    const response = await patchQuiz(quizId, { is_active: 'yes' });

    expect(response.status).toBe(400);
    expect(await isActive(quizId)).toBe(true);
  });
});
