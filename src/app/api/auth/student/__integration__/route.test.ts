import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, participants } from '@/lib/db';
import { resetGroupingTables, seedQuiz } from '@/test/grouping-fixtures';

const createSession = vi.fn();
vi.mock('@/lib/session', () => ({
  createSession: (...args: unknown[]) => createSession(...args),
}));

const NAME_MISMATCH_MESSAGE = '此學號已由其他姓名登入，請確認姓名與學號，或洽詢老師';

async function login(quizId: string, displayName: string, studentNo: string) {
  const { POST } = await import('@/app/api/auth/student/route');
  const response = await POST(
    new NextRequest('http://localhost/api/auth/student', {
      method: 'POST',
      body: JSON.stringify({ quizId, displayName, studentNo }),
    })
  );
  return { status: response.status, body: await response.json() };
}

async function participantsWithStudentNo(quizId: string, studentNo: string) {
  return db
    .select()
    .from(participants)
    .where(and(eq(participants.quizId, quizId), eq(participants.studentNo, studentNo)));
}

describe('POST /api/auth/student', () => {
  beforeEach(async () => {
    createSession.mockReset();
    await resetGroupingTables();
  });

  it('rejects an existing student number with a different name', async () => {
    const { quizId } = await seedQuiz();
    await login(quizId, '王小明', 'S001');
    createSession.mockReset();

    const response = await login(quizId, '李大華', 's001');

    expect(response).toEqual({ status: 409, body: { message: NAME_MISMATCH_MESSAGE } });
    expect(createSession).not.toHaveBeenCalled();
    const rows = await participantsWithStudentNo(quizId, 'S001');
    expect(rows.map((row) => row.displayName)).toEqual(['王小明']);
  });

  it('logs in as the existing participant when the name matches', async () => {
    const { quizId } = await seedQuiz();
    await login(quizId, 'Amy Chen', 'S001');
    const [existing] = await participantsWithStudentNo(quizId, 'S001');
    createSession.mockReset();

    const response = await login(quizId, ' amy chen ', 'S001');

    expect(response.status).toBe(200);
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ participantId: existing.id }));
  });

  it.each([
    ['王小明', '王小明', 200],
    ['王小明', ' 王小明 ', 200],
    ['Amy Chen', 'AMY CHEN', 200],
    ['王小明', '王曉明', 409],
    ['Amy Chen', 'Amy  Chen', 409],
  ])('stored %j, submitted %j answers %i', async (storedName, submittedName, expectedStatus) => {
    const { quizId } = await seedQuiz();
    await login(quizId, storedName, 'S001');

    const response = await login(quizId, submittedName, 'S001');

    expect(response.status).toBe(expectedStatus);
    expect(await participantsWithStudentNo(quizId, 'S001')).toHaveLength(1);
  });

  it('creates one participant when two first logins share a student number', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await resetGroupingTables();
      const { quizId } = await seedQuiz();

      const responses = await Promise.all([login(quizId, '甲', 'S002'), login(quizId, '乙', 'S002')]);

      expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
      expect(await participantsWithStudentNo(quizId, 'S002')).toHaveLength(1);
    }
  });

  it('still reports an unavailable quiz as 401', async () => {
    const response = await login('00000000-0000-4000-8000-000000000000', '王小明', 'S001');

    expect(response).toEqual({ status: 401, body: { message: '測驗不存在或未開放，請檢查測驗代碼' } });
  });
});
