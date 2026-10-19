import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, answers, groupMembers, participants, quizzes, submissions } from '@/lib/db';
import type { UserSession } from '@/lib/auth';
import {
  activeRuns,
  resetGroupingTables,
  seedAutomaticRunWithTwoGroups,
  seedQuiz,
  submit,
} from '@/test/grouping-fixtures';

let currentSession: UserSession | null = null;
vi.mock('@/lib/session', () => ({
  getSession: async () => currentSession,
  createSession: async () => {},
}));

function asAdmin(adminId: string) {
  currentSession = { type: 'admin', id: adminId, name: 'Admin', email: `${adminId}@example.com` };
}

async function deleteParticipant(quizId: string, participantId: string) {
  const { DELETE } = await import('@/app/api/admin/quizzes/[id]/participants/[participantId]/route');
  const response = await DELETE(
    new NextRequest('http://localhost/api/admin/quizzes/x/participants/y', { method: 'DELETE' }),
    { params: Promise.resolve({ id: quizId, participantId }) }
  );
  return { status: response.status, body: await response.json() };
}

async function studentLogin(quizId: string, displayName: string, studentNo: string) {
  const { POST } = await import('@/app/api/auth/student/route');
  const response = await POST(
    new NextRequest('http://localhost/api/auth/student', {
      method: 'POST',
      body: JSON.stringify({ quizId, displayName, studentNo }),
    })
  );
  return response.status;
}

async function participantExists(participantId: string) {
  return (await db.select({ id: participants.id }).from(participants).where(eq(participants.id, participantId))).length === 1;
}

describe('DELETE /api/admin/quizzes/[id]/participants/[participantId]', () => {
  beforeEach(async () => {
    currentSession = null;
    await resetGroupingTables();
  });

  it('frees a student number taken by mistake, removing the submission and answers', async () => {
    const { adminId, quizId } = await seedQuiz();
    expect(await studentLogin(quizId, '李大華', 'S001')).toBe(200);
    const [wrong] = await db
      .select()
      .from(participants)
      .where(and(eq(participants.quizId, quizId), eq(participants.studentNo, 'S001')));
    const [submission] = await db
      .insert(submissions)
      .values({ quizId, participantId: wrong.id, totalScore: '10' })
      .returning();
    expect(await studentLogin(quizId, '王小明', 'S001')).toBe(409);
    asAdmin(adminId);

    const response = await deleteParticipant(quizId, wrong.id);

    expect(response).toEqual({ status: 200, body: { message: '已刪除參與者' } });
    expect(await participantExists(wrong.id)).toBe(false);
    expect(await db.select().from(submissions).where(eq(submissions.id, submission.id))).toHaveLength(0);
    expect(await db.select().from(answers).where(eq(answers.submissionId, submission.id))).toHaveLength(0);
    expect(await studentLogin(quizId, '王小明', 'S001')).toBe(200);
  });

  it('removes only the deleted member and keeps an automatic run automatic', async () => {
    const { adminId, quizId, groupRows, first } = await seedAutomaticRunWithTwoGroups();
    const [runBefore] = await activeRuns(quizId);
    const membersBefore = await db.select().from(groupMembers);
    asAdmin(adminId);

    const response = await deleteParticipant(quizId, first.participantId);

    expect(response.status).toBe(200);
    const [runAfter] = await activeRuns(quizId);
    expect(runAfter.id).toBe(runBefore.id);
    expect((runAfter.config as Record<string, unknown>).trigger).toBe('automatic');
    const membersAfter = await db.select().from(groupMembers);
    expect(membersAfter.map((m) => m.participantId).sort()).toEqual(
      membersBefore.filter((m) => m.participantId !== first.participantId).map((m) => m.participantId).sort()
    );
    expect(groupRows).toHaveLength(2);
  });

  it('refuses another admin with 403 and keeps the participant', async () => {
    const { quizId } = await seedQuiz();
    const participantId = await submit(quizId, 10);
    asAdmin('00000000-0000-4000-8000-000000000000');

    const response = await deleteParticipant(quizId, participantId);

    expect(response.status).toBe(403);
    expect(await participantExists(participantId)).toBe(true);
  });

  it('answers 404 for a participant of another quiz and keeps it', async () => {
    const { adminId, quizId } = await seedQuiz();
    const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, quizId));
    const [otherQuiz] = await db
      .insert(quizzes)
      .values({ title: 'Other', classId: quiz.classId, createdBy: adminId, isActive: true })
      .returning();
    const otherParticipant = await submit(otherQuiz.id, 10);
    asAdmin(adminId);

    const response = await deleteParticipant(quizId, otherParticipant);

    expect(response).toEqual({ status: 404, body: { message: '參與者不存在' } });
    expect(await participantExists(otherParticipant)).toBe(true);
  });
});
