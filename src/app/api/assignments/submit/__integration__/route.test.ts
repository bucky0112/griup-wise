import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, answers, questions, submissions } from '@/lib/db';
import { addParticipant, resetGroupingTables, seedQuiz } from '@/test/grouping-fixtures';

const getSession = vi.fn();
vi.mock('@/lib/session', () => ({
  getSession: () => getSession(),
}));

async function seedQuestion(quizId: string, type: 'single' | 'short_text', orderIndex: number) {
  const [question] = await db
    .insert(questions)
    .values({
      quizId,
      type,
      prompt: `Q${orderIndex}`,
      options: type === 'single' ? ['A', 'B'] : null,
      answerKey: type === 'single' ? ['A'] : [],
      score: '10',
      orderIndex,
    })
    .returning();
  return question.id;
}

async function postSubmit(body: unknown) {
  const { POST } = await import('@/app/api/assignments/submit/route');
  const response = await POST(
    new NextRequest('http://localhost/api/assignments/submit', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  );
  return { status: response.status, body: await response.json() };
}

async function storedAnswers(submissionId: string) {
  return db.select().from(answers).where(eq(answers.submissionId, submissionId));
}

describe('POST /api/assignments/submit', () => {
  let quizId: string;

  beforeEach(async () => {
    await resetGroupingTables();
    ({ quizId } = await seedQuiz());
    const participant = await addParticipant(quizId, '王小明');
    getSession.mockResolvedValue({ type: 'student', quizId, participantId: participant.id });
  });

  it('accepts a submission with no answers and scores it 0', async () => {
    const s1 = await seedQuestion(quizId, 'single', 1);
    const t1 = await seedQuestion(quizId, 'short_text', 2);

    const response = await postSubmit({ answers: {} });

    expect(response.status).toBe(200);
    const [submission] = await db.select().from(submissions).where(eq(submissions.id, response.body.submissionId));
    expect(Number(submission.totalScore)).toBe(0);
    const rows = await storedAnswers(submission.id);
    expect(rows.map((row) => row.questionId).sort()).toEqual([s1, t1].sort());
    for (const row of rows) {
      expect(row).toMatchObject({ response: null, earnedScore: '0', reviewStatus: 'auto' });
    }
  });

  it('stores unanswered questions as null with 0 points and keeps answered short text pending', async () => {
    const s1 = await seedQuestion(quizId, 'single', 1);
    const s2 = await seedQuestion(quizId, 'single', 2);
    const s3 = await seedQuestion(quizId, 'single', 3);
    const t1 = await seedQuestion(quizId, 'short_text', 4);
    const t2 = await seedQuestion(quizId, 'short_text', 5);

    const response = await postSubmit({
      answers: {
        [s1]: 'A',
        [s2]: 'A',
        [t1]: { type: 'text_response', content: 'Ruby 是物件導向語言' },
        [t2]: { type: 'text_response', content: '   ' },
      },
    });

    expect(response.status).toBe(200);
    const [submission] = await db.select().from(submissions).where(eq(submissions.id, response.body.submissionId));
    expect(Number(submission.totalScore)).toBe(20);
    const rows = new Map((await storedAnswers(submission.id)).map((row) => [row.questionId, row]));
    expect(rows.size).toBe(5);
    expect(rows.get(s3)).toMatchObject({ response: null, earnedScore: '0', reviewStatus: 'auto' });
    expect(rows.get(t2)).toMatchObject({ response: null, earnedScore: '0', reviewStatus: 'auto' });
    expect(rows.get(t1)).toMatchObject({ reviewStatus: 'pending' });
    expect([...rows.values()].filter((row) => row.reviewStatus === 'pending')).toHaveLength(1);
  });
});
