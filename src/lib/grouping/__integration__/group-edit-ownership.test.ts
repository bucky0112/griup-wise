import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, admins, groupMembers } from '@/lib/db';
import type { UserSession } from '@/lib/auth';
import { resetGroupingTables, seedAutomaticRunWithTwoGroups, snapshotGrouping } from '@/test/grouping-fixtures';

let currentSession: UserSession | null = null;
vi.mock('@/lib/session', () => ({
  getSession: async () => currentSession,
}));

const FORBIDDEN_MESSAGE = '無權限操作此分組';

async function seedOtherAdmin() {
  const [other] = await db
    .insert(admins)
    .values({ name: 'Other', email: 'other@example.com', passwordHash: 'not-a-real-hash' })
    .returning();
  return other;
}

function loginAs(id: string, email: string) {
  currentSession = { type: 'admin', id, name: email, email };
}

function jsonRequest(method: string, body: unknown) {
  return new NextRequest('http://localhost/api/admin/groups', { method, body: JSON.stringify(body) });
}

describe('Only the quiz owner edits group membership', () => {
  beforeEach(async () => {
    currentSession = null;
    await resetGroupingTables();
  });

  it('refuses every member-edit route for an admin who does not own the quiz', async () => {
    const { quizId, groupRows, first, second } = await seedAutomaticRunWithTwoGroups();
    const other = await seedOtherAdmin();
    const before = await snapshotGrouping(quizId);
    loginAs(other.id, other.email);

    const params = (groupId: string) => ({ params: Promise.resolve({ groupId }) });
    const move = await import('@/app/api/admin/groups/move-participant/route');
    const batchMove = await import('@/app/api/admin/groups/batch-move/route');
    const groupMove = await import('@/app/api/admin/groups/[groupId]/members/move/route');
    const swap = await import('@/app/api/admin/groups/members/swap/route');
    const batchOperations = await import('@/app/api/admin/groups/batch-operations/route');
    const members = await import('@/app/api/admin/groups/[groupId]/members/route');

    const responses = {
      'move-participant': await move.POST(
        jsonRequest('POST', { participantId: first.participantId, targetGroupId: groupRows[1].id })
      ),
      'batch-move': await batchMove.POST(
        jsonRequest('POST', { participantIds: [first.participantId], targetGroupId: groupRows[1].id })
      ),
      '[groupId]/members/move': await groupMove.PUT(
        jsonRequest('PUT', { participantId: first.participantId, targetGroupId: groupRows[1].id }),
        params(groupRows[0].id)
      ),
      'members/swap': await swap.PUT(
        jsonRequest('PUT', { participant1Id: first.participantId, participant2Id: second.participantId })
      ),
      'batch-operations': await batchOperations.POST(
        jsonRequest('POST', { operation: 'move', participantIds: [first.participantId], targetGroupId: groupRows[1].id })
      ),
      'members PATCH': await members.PATCH(
        jsonRequest('PATCH', { participant_id: first.participantId, new_group_id: groupRows[1].id }),
        params(groupRows[0].id)
      ),
    };

    for (const [route, response] of Object.entries(responses)) {
      expect(response.status, route).toBe(403);
      expect((await response.json()).message, route).toBe(FORBIDDEN_MESSAGE);
    }
    expect(await snapshotGrouping(quizId)).toEqual(before);
  });

  it('lets the owner move a participant', async () => {
    const { adminId, groupRows, first } = await seedAutomaticRunWithTwoGroups();
    loginAs(adminId, 'owner@example.com');
    const move = await import('@/app/api/admin/groups/move-participant/route');

    const response = await move.POST(
      jsonRequest('POST', { participantId: first.participantId, targetGroupId: groupRows[1].id })
    );

    expect(response.status).toBe(200);
    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.participantId, first.participantId), eq(groupMembers.groupId, groupRows[1].id)));
    expect(membership).toBeDefined();
  });
});
