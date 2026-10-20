import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, questions } from '@/lib/db';
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

const MULTI_LINE_PROMPT = '需求：\n- 電腦版：一列 3 張\n- 手機：一列 1 張';

const singleChoice = {
  prompt: MULTI_LINE_PROMPT,
  type: 'single',
  score: 5,
  options: ['A', 'B'],
  correctAnswers: ['A'],
};

async function createQuestion(quizId: string, body: unknown) {
  const { POST } = await import('@/app/api/quizzes/[id]/questions/route');
  const response = await POST(
    new NextRequest('http://localhost/api/quizzes/x/questions', { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: quizId }) }
  );
  return { status: response.status, body: await response.json() };
}

async function updateQuestion(quizId: string, questionId: string, body: unknown) {
  const { PUT } = await import('@/app/api/quizzes/[id]/questions/[questionId]/route');
  const response = await PUT(
    new NextRequest('http://localhost/api/quizzes/x/questions/y', { method: 'PUT', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: quizId, questionId }) }
  );
  return { status: response.status, body: await response.json() };
}

async function storedQuestion(questionId: string) {
  const [question] = await db
    .select({ prompt: questions.prompt, score: questions.score })
    .from(questions)
    .where(eq(questions.id, questionId));
  return question;
}

describe('questions API keeps prompt line breaks', () => {
  beforeEach(async () => {
    currentSession = null;
    await resetGroupingTables();
  });

  it('stores a multi-line prompt from POST unchanged', async () => {
    const { adminId, quizId } = await seedQuiz();
    asAdmin(adminId);

    const response = await createQuestion(quizId, { ...singleChoice, orderIndex: 1 });

    expect(response.status).toBe(201);
    expect((await storedQuestion(response.body.question.id)).prompt).toBe(MULTI_LINE_PROMPT);
  });

  it('keeps the prompt identical when PUT changes only the score', async () => {
    const { adminId, quizId } = await seedQuiz();
    asAdmin(adminId);
    const created = await createQuestion(quizId, { ...singleChoice, orderIndex: 1 });
    const questionId = created.body.question.id;

    const response = await updateQuestion(quizId, questionId, { ...singleChoice, score: 10 });

    expect(response.status).toBe(200);
    expect(await storedQuestion(questionId)).toEqual({ prompt: MULTI_LINE_PROMPT, score: '10' });
  });
});
