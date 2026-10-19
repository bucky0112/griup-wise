import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, groupingEvents, groups, quizzes } from '@/lib/db';
import { GroupingManager } from '@/lib/grouping/manager';
import { defaultConfigs } from '@/lib/grouping/config';
import {
  ADMIN_MANAGED_REASON,
  PUBLISHED_REASON,
  activeRuns,
  autoGroupAfterSubmit,
  expireCooldown,
  resetGroupingTables,
  seedAutomaticRunWithTwoGroups,
  seedQuiz,
  snapshotGrouping,
  submit,
} from '@/test/grouping-fixtures';
import type { UserSession } from '@/lib/auth';

let currentSession: UserSession | null = null;
vi.mock('@/lib/session', () => ({
  getSession: async () => currentSession,
}));

// performGrouping is private; the race test intercepts it to change visibility after the early check
type PerformGrouping = (...args: unknown[]) => Promise<unknown>;
const managerProto = GroupingManager.prototype as unknown as { performGrouping: PerformGrouping };

const ITERATIONS = 10;
const REPEATED_TEST_TIMEOUT_MS = 30_000;
const STALE_MESSAGE = '分組已更新，請重新整理後再操作';
const twoPerGroup = { ...defaultConfigs.medium, target_group_size: 2 };

function asAdmin(adminId: string) {
  currentSession = { type: 'admin', id: adminId, name: 'Admin', email: `${adminId}@example.com` };
}

async function patchGroup(groupId: string, body: Record<string, unknown>) {
  const { PATCH } = await import('@/app/api/admin/groups/[groupId]/route');
  const response = await PATCH(
    new NextRequest('http://localhost/api/admin/groups/x', { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ groupId }) }
  );
  return { status: response.status, body: await response.json() };
}

async function groupName(groupId: string) {
  const [row] = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId));
  return row?.name;
}

async function setVisibility(quizId: string, visible: boolean) {
  await db.update(quizzes).set({ showGroupPublicly: visible }).where(eq(quizzes.id, quizId));
}

describe('automatic grouping freeze conditions', () => {
  beforeEach(async () => {
    currentSession = null;
    await resetGroupingTables();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Automatic grouping preserves admin-owned groups', () => {
    it('keeps a renamed automatic run', async () => {
      const { adminId, quizId, groupRows } = await seedAutomaticRunWithTwoGroups();
      asAdmin(adminId);
      expect((await patchGroup(groupRows[0].id, { name: '火箭隊' })).status).toBe(200);
      await expireCooldown(quizId);
      const before = await snapshotGrouping(quizId);

      const p5 = await submit(quizId, 50);
      const result = await autoGroupAfterSubmit(quizId, p5, twoPerGroup);

      expect(result.success).toBe(false);
      expect(result.triggerEvaluation?.reason).toBe(ADMIN_MANAGED_REASON);
      expect(await snapshotGrouping(quizId)).toEqual(before);
      expect(await groupName(groupRows[0].id)).toBe('火箭隊');
    });
  });

  describe('Grouping changes for a quiz are serialized', () => {
    it('runs an automatic regroup and a group rename at the same time without a 500', async () => {
      for (let i = 0; i < ITERATIONS; i++) {
        await resetGroupingTables();
        const { adminId, quizId, groupRows } = await seedAutomaticRunWithTwoGroups();
        await expireCooldown(quizId);
        const [seededRun] = await activeRuns(quizId);
        asAdmin(adminId);
        const p5 = await submit(quizId, 50);

        const [regroup, rename] = await Promise.allSettled([
          autoGroupAfterSubmit(quizId, p5, twoPerGroup),
          patchGroup(groupRows[0].id, { name: '火箭隊' }),
        ]);

        expect(regroup.status, `iteration ${i}`).toBe('fulfilled');
        expect(rename.status, `iteration ${i}`).toBe('fulfilled');
        const { status } = (rename as PromiseFulfilledResult<{ status: number }>).value;
        const runs = await activeRuns(quizId);
        expect(runs).toHaveLength(1);
        if (status === 200) {
          expect(runs[0].id, `iteration ${i}`).toBe(seededRun.id);
          expect(await groupName(groupRows[0].id)).toBe('火箭隊');
        } else {
          expect(status, `iteration ${i}`).toBe(409);
          expect(runs[0].id, `iteration ${i}`).not.toBe(seededRun.id);
        }
      }
    }, REPEATED_TEST_TIMEOUT_MS);
  });

  describe('Group detail edits on replaced groups are rejected', () => {
    it('rejects a rename through a replaced group with 409', async () => {
      const { adminId, quizId, groupRows } = await seedAutomaticRunWithTwoGroups();
      await expireCooldown(quizId);
      const p5 = await submit(quizId, 50);
      expect((await autoGroupAfterSubmit(quizId, p5, twoPerGroup)).success).toBe(true);
      const before = await snapshotGrouping(quizId);
      asAdmin(adminId);

      const response = await patchGroup(groupRows[0].id, { name: '火箭隊' });

      expect(response).toEqual({ status: 409, body: { message: STALE_MESSAGE } });
      expect(await snapshotGrouping(quizId)).toEqual(before);
    });

    it('rejects an edit naming a group that never existed with 409', async () => {
      const { adminId } = await seedAutomaticRunWithTwoGroups();
      asAdmin(adminId);

      const response = await patchGroup('00000000-0000-4000-8000-000000000000', { name: '火箭隊' });

      expect(response).toEqual({ status: 409, body: { message: STALE_MESSAGE } });
    });

    it('rejects an edit from an admin who does not own the quiz with 403', async () => {
      const { groupRows } = await seedAutomaticRunWithTwoGroups();
      asAdmin('00000000-0000-4000-8000-000000000000');

      const response = await patchGroup(groupRows[0].id, { name: '火箭隊' });

      expect(response.status).toBe(403);
      expect(await groupName(groupRows[0].id)).toBe(groupRows[0].name);
    });
  });

  describe('Automatic grouping pauses while groups are visible to students', () => {
    it('keeps visible automatic groups and records skipped_published', async () => {
      const { quizId } = await seedAutomaticRunWithTwoGroups();
      await setVisibility(quizId, true);
      await expireCooldown(quizId);
      const before = await snapshotGrouping(quizId);

      const p5 = await submit(quizId, 50);
      const result = await autoGroupAfterSubmit(quizId, p5, twoPerGroup);

      expect(result.success).toBe(false);
      expect(result.triggerEvaluation?.reason).toBe(PUBLISHED_REASON);
      expect(await snapshotGrouping(quizId)).toEqual(before);
      const [event] = await db
        .select()
        .from(groupingEvents)
        .where(eq(groupingEvents.participantId, p5));
      expect((event.triggerMetadata as Record<string, unknown>).grouping_status).toBe('skipped_published');
      expect(event.shouldTriggerGrouping).toBe(false);
      expect(event.oldRankingHash ?? '').toBe('');
      expect(event.newRankingHash ?? '').toBe('');
    });

    it('reports the admin-managed reason when the visible run is also admin-managed', async () => {
      const { adminId, quizId, groupRows } = await seedAutomaticRunWithTwoGroups();
      asAdmin(adminId);
      expect((await patchGroup(groupRows[0].id, { name: '火箭隊' })).status).toBe(200);
      await setVisibility(quizId, true);
      await expireCooldown(quizId);

      const p5 = await submit(quizId, 50);
      const result = await autoGroupAfterSubmit(quizId, p5, twoPerGroup);

      expect(result.success).toBe(false);
      expect(result.triggerEvaluation?.reason).toBe(ADMIN_MANAGED_REASON);
    });

    it('resumes automatic grouping after the groups are hidden again', async () => {
      const { quizId } = await seedAutomaticRunWithTwoGroups();
      await setVisibility(quizId, true);
      await expireCooldown(quizId);
      const p5 = await submit(quizId, 50);
      expect((await autoGroupAfterSubmit(quizId, p5, twoPerGroup)).success).toBe(false);
      const [frozenRun] = await activeRuns(quizId);

      await setVisibility(quizId, false);
      await expireCooldown(quizId);
      const p6 = await submit(quizId, 40);
      const result = await autoGroupAfterSubmit(quizId, p6, twoPerGroup);

      expect(result.success).toBe(true);
      const [newRun] = await activeRuns(quizId);
      expect(newRun.id).not.toBe(frozenRun.id);
      expect(result.totalMembers).toBe(6);
    });

    it('creates the first grouping on a quiz already visible to students', async () => {
      const { quizId } = await seedQuiz();
      await setVisibility(quizId, true);
      await submit(quizId, 90);
      await submit(quizId, 80);
      const p3 = await submit(quizId, 70);

      const result = await autoGroupAfterSubmit(quizId, p3);

      expect(result.success).toBe(true);
      expect(await activeRuns(quizId)).toHaveLength(1);
    });

    it('keeps the run when visibility is turned on after the early check', async () => {
      const { quizId } = await seedAutomaticRunWithTwoGroups();
      await expireCooldown(quizId);
      const original = managerProto.performGrouping;
      vi.spyOn(managerProto, 'performGrouping').mockImplementationOnce(async function (this: unknown, ...args: unknown[]) {
        await setVisibility(quizId, true);
        return original.apply(this, args);
      });
      const before = await snapshotGrouping(quizId);

      const p5 = await submit(quizId, 50);
      const result = await autoGroupAfterSubmit(quizId, p5, twoPerGroup);

      expect(result.success).toBe(false);
      expect(result.triggerEvaluation?.reason).toBe(PUBLISHED_REASON);
      expect(await snapshotGrouping(quizId)).toEqual(before);
    });
  });
});
