import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, groupingRuns, groups, groupMembers } from '@/lib/db';
import type { UserSession } from '@/lib/auth';
import {
  activeRuns,
  addParticipant,
  resetGroupingTables,
  seedAutomaticRunWithTwoGroups,
  seedQuiz,
  submit,
} from '@/test/grouping-fixtures';

let currentSession: UserSession | null = null;
vi.mock('@/lib/session', () => ({
  getSession: async () => currentSession,
}));

async function createGroups(quizId: string, targetGroupSize: number) {
  const { POST } = await import('@/app/api/admin/quizzes/[id]/groups/create/route');
  const body = { target_group_size: targetGroupSize, include_unsubmitted: false, strategy: 'snake_by_score' };
  const response = await POST(
    new NextRequest('http://localhost/api/admin/quizzes/x/groups/create', { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: quizId }) }
  );
  return { status: response.status, body: await response.json() };
}

function loginAs(id: string) {
  currentSession = { type: 'admin', id, name: 'Admin', email: `${id}@example.com` };
}

async function groupsOf(quizId: string) {
  const groupRows = await db.select().from(groups).where(eq(groups.quizId, quizId)).orderBy(groups.orderIndex);
  return Promise.all(groupRows.map(async (group) => ({
    ...group,
    members: await db.select().from(groupMembers).where(eq(groupMembers.groupId, group.id)),
  })));
}

async function runStatus(runId: string) {
  const [run] = await db.select().from(groupingRuns).where(eq(groupingRuns.id, runId));
  return run.status;
}

describe('POST /api/admin/quizzes/[id]/groups/create', () => {
  beforeEach(async () => {
    currentSession = null;
    await resetGroupingTables();
  });

  it('groups seven submitted participants into three groups of size 3', async () => {
    const { adminId, quizId } = await seedQuiz();
    for (const score of [95, 90, 85, 80, 75, 70, 65]) await submit(quizId, score);
    loginAs(adminId);

    const result = await createGroups(quizId, 3);

    expect(result.status).toBe(200);
    expect(result.body.groups_created).toBe(3);
    const created = await groupsOf(quizId);
    expect(created.flatMap((group) => group.members)).toHaveLength(7);
  });

  it('rejects a quiz without participants with the API message', async () => {
    const { adminId, quizId } = await seedQuiz();
    loginAs(adminId);

    expect(await createGroups(quizId, 3)).toEqual({
      status: 400,
      body: { message: '此測驗沒有參與者，無法建立分組' },
    });
  });

  it('rejects a quiz whose participants have not submitted when unsubmitted are excluded', async () => {
    const { adminId, quizId } = await seedQuiz();
    await addParticipant(quizId, 'Not submitted');
    loginAs(adminId);

    expect(await createGroups(quizId, 3)).toEqual({
      status: 400,
      body: { message: '沒有符合條件的參與者可以分組' },
    });
    expect(await activeRuns(quizId)).toHaveLength(0);
  });

  it('replaces a grouping it created earlier', async () => {
    const { adminId, quizId } = await seedQuiz();
    for (const score of [90, 80, 70, 60]) await submit(quizId, score);
    loginAs(adminId);

    const first = await createGroups(quizId, 2);
    expect(first.status).toBe(200);
    expect(first.body.groups_created).toBe(2);

    const second = await createGroups(quizId, 4);

    expect(second.status).toBe(200);
    const runs = await activeRuns(quizId);
    expect(runs.map((run) => run.id)).toEqual([second.body.run_id]);
    expect(await runStatus(first.body.run_id)).toBe('archived');
    const remaining = await groupsOf(quizId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ name: '第 1 組', groupingRunId: second.body.run_id });
    expect(remaining[0].members).toHaveLength(4);
  });

  it('replaces an automatic grouping', async () => {
    const { adminId, quizId } = await seedAutomaticRunWithTwoGroups();
    const [automaticRun] = await activeRuns(quizId);
    loginAs(adminId);

    const result = await createGroups(quizId, 2);

    expect(result.status).toBe(200);
    expect(await runStatus(automaticRun.id)).toBe('archived');
    const remaining = await groupsOf(quizId);
    expect(remaining.map((group) => group.groupingRunId)).toEqual([result.body.run_id, result.body.run_id]);
  });
});
