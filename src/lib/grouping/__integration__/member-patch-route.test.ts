import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, admins, groupMembers } from '@/lib/db';
import type { UserSession } from '@/lib/auth';
import {
  activeRuns,
  autoGroupAfterSubmit,
  expireCooldown,
  resetGroupingTables,
  seedAutomaticRunWithTwoGroups,
  snapshotGrouping,
  submit,
} from '@/test/grouping-fixtures';
import { defaultConfigs } from '@/lib/grouping/config';

let currentSession: UserSession | null = null;
vi.mock('@/lib/session', () => ({
  getSession: async () => currentSession,
}));

// Pins every response of PATCH /api/admin/groups/[groupId]/members so the route can be rebuilt on the manager.
async function patch(groupId: string, body: { participant_id: string; new_group_id: string | null }) {
  const { PATCH } = await import('@/app/api/admin/groups/[groupId]/members/route');
  const response = await PATCH(
    new NextRequest('http://localhost/api/admin/groups/x/members', { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ groupId }) }
  );
  return { status: response.status, body: await response.json() };
}

function loginAs(id: string) {
  currentSession = { type: 'admin', id, name: 'Admin', email: `${id}@example.com` };
}

async function membership(participantId: string, groupId: string) {
  const [row] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.participantId, participantId), eq(groupMembers.groupId, groupId)));
  return row;
}

describe('PATCH /api/admin/groups/[groupId]/members', () => {
  beforeEach(async () => {
    currentSession = null;
    await resetGroupingTables();
  });

  it('moves a member to another group of the active run', async () => {
    const { adminId, quizId, groupRows, first } = await seedAutomaticRunWithTwoGroups();
    loginAs(adminId);

    const result = await patch(groupRows[0].id, { participant_id: first.participantId, new_group_id: groupRows[1].id });

    expect(result).toEqual({
      status: 200,
      body: {
        message: '組員移動成功',
        participant_id: first.participantId,
        from_group_id: groupRows[0].id,
        to_group_id: groupRows[1].id,
      },
    });
    expect(await membership(first.participantId, groupRows[1].id)).toBeDefined();
    expect(await membership(first.participantId, groupRows[0].id)).toBeUndefined();
    const [run] = await activeRuns(quizId);
    expect((run.config as Record<string, unknown>).trigger).toBe('manual_adjusted');
  });

  it('removes a member from its group', async () => {
    const { adminId, quizId, groupRows, first } = await seedAutomaticRunWithTwoGroups();
    loginAs(adminId);

    const result = await patch(groupRows[0].id, { participant_id: first.participantId, new_group_id: null });

    expect(result).toEqual({
      status: 200,
      body: { message: '組員移除成功', participant_id: first.participantId, removed_from_group_id: groupRows[0].id },
    });
    expect(await membership(first.participantId, groupRows[0].id)).toBeUndefined();
    const [run] = await activeRuns(quizId);
    expect((run.config as Record<string, unknown>).trigger).toBe('manual_adjusted');
  });

  it('answers 400 when the participant is not in the named group', async () => {
    const { adminId, quizId, groupRows, second } = await seedAutomaticRunWithTwoGroups();
    loginAs(adminId);
    const before = await snapshotGrouping(quizId);

    const result = await patch(groupRows[0].id, { participant_id: second.participantId, new_group_id: null });

    expect(result).toEqual({ status: 400, body: { message: '該參與者不在此組別中' } });
    expect(await snapshotGrouping(quizId)).toEqual(before);
  });

  it('answers 400 when the participant is already in the target group', async () => {
    const { adminId, quizId, groupRows, first } = await seedAutomaticRunWithTwoGroups();
    loginAs(adminId);
    const before = await snapshotGrouping(quizId);

    const result = await patch(groupRows[0].id, { participant_id: first.participantId, new_group_id: groupRows[0].id });

    expect(result).toEqual({ status: 400, body: { message: '該參與者已在目標組別中' } });
    expect(await snapshotGrouping(quizId)).toEqual(before);
  });

  it('answers 403 for an admin who does not own the quiz', async () => {
    const { quizId, groupRows, first } = await seedAutomaticRunWithTwoGroups();
    const [other] = await db
      .insert(admins)
      .values({ name: 'Other', email: 'other@example.com', passwordHash: 'not-a-real-hash' })
      .returning();
    loginAs(other.id);
    const before = await snapshotGrouping(quizId);

    const result = await patch(groupRows[0].id, { participant_id: first.participantId, new_group_id: groupRows[1].id });

    expect(result).toEqual({ status: 403, body: { message: '無權限操作此分組' } });
    expect(await snapshotGrouping(quizId)).toEqual(before);
  });

  it('answers 409 for a group replaced by a regroup', async () => {
    const { adminId, quizId, groupRows, first } = await seedAutomaticRunWithTwoGroups();
    await expireCooldown(quizId);
    const late = await submit(quizId, 50);
    const regrouped = await autoGroupAfterSubmit(quizId, late, { ...defaultConfigs.medium, target_group_size: 2 });
    expect(regrouped.success).toBe(true);
    loginAs(adminId);
    const before = await snapshotGrouping(quizId);

    const result = await patch(groupRows[0].id, { participant_id: first.participantId, new_group_id: null });

    expect(result).toEqual({ status: 409, body: { message: '分組已更新，請重新整理後再操作' } });
    expect(await snapshotGrouping(quizId)).toEqual(before);
  });
});
