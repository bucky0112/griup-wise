import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { db, answers, questions, submissions } from '@/lib/db';
import type { UserSession } from '@/lib/auth';
import { addParticipant, resetGroupingTables, seedQuiz } from '@/test/grouping-fixtures';

let currentSession: UserSession | null = null;
vi.mock('@/lib/session', () => ({
  getSession: async () => currentSession,
  createSession: async () => {},
}));

function asAdmin(adminId: string) {
  currentSession = { type: 'admin', id: adminId, name: 'Admin', email: `${adminId}@example.com` };
}

async function getScores(quizId: string) {
  const { GET } = await import('@/app/api/admin/quizzes/[id]/scores/route');
  const response = await GET(
    new NextRequest('http://localhost/api/admin/quizzes/x/scores'),
    { params: Promise.resolve({ id: quizId }) }
  );
  return { status: response.status, body: await response.json() };
}

async function addQuestion(quizId: string, orderIndex: number, score: number) {
  const [question] = await db
    .insert(questions)
    .values({ quizId, type: 'single', prompt: `Q${orderIndex}`, answerKey: 'A', score: String(score), orderIndex })
    .returning();
  return question.id;
}

// Inserts a submission whose answers carry the given earned scores, keyed by question id.
async function submitWithAnswers(quizId: string, displayName: string, earned: Record<string, number>) {
  const participant = await addParticipant(quizId, displayName);
  const total = Object.values(earned).reduce((sum, score) => sum + score, 0);
  const [submission] = await db
    .insert(submissions)
    .values({ quizId, participantId: participant.id, totalScore: String(total) })
    .returning();
  await db.insert(answers).values(
    Object.entries(earned).map(([questionId, score]) => ({
      submissionId: submission.id,
      questionId,
      response: 'A',
      earnedScore: String(score),
    }))
  );
  return participant.id;
}

describe('GET /api/admin/quizzes/[id]/scores', () => {
  beforeEach(async () => {
    currentSession = null;
    await resetGroupingTables();
  });

  it('reports each participant their own stored earned score per question', async () => {
    const { adminId, quizId } = await seedQuiz();
    const q1 = await addQuestion(quizId, 1, 10);
    const q2 = await addQuestion(quizId, 2, 10);
    const q3 = await addQuestion(quizId, 3, 5);
    const a = await submitWithAnswers(quizId, 'A', { [q1]: 10, [q2]: 0 });
    const b = await submitWithAnswers(quizId, 'B', { [q1]: 0, [q2]: 10, [q3]: 5 });
    const c = (await addParticipant(quizId, 'C')).id;
    asAdmin(adminId);

    const { status, body } = await getScores(quizId);

    expect(status).toBe(200);
    type Detail = { question_id: string; earned_score: number; max_score: number };
    const detailOf = (participantId: string): Record<string, Pick<Detail, 'earned_score' | 'max_score'>> =>
      Object.fromEntries(
        body.participants
          .find((p: { id: string }) => p.id === participantId)
          .answers_detail.map((d: Detail) => [d.question_id, { earned_score: d.earned_score, max_score: d.max_score }])
      );
    expect(detailOf(a)).toEqual({
      [q1]: { earned_score: 10, max_score: 10 },
      [q2]: { earned_score: 0, max_score: 10 },
      [q3]: { earned_score: 0, max_score: 5 },
    });
    expect(detailOf(b)).toEqual({
      [q1]: { earned_score: 0, max_score: 10 },
      [q2]: { earned_score: 10, max_score: 10 },
      [q3]: { earned_score: 5, max_score: 5 },
    });
    expect(detailOf(c)).toEqual({});
  });
});
