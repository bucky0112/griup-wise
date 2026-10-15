import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, groupingEvents, groupingRuns } from '@/lib/db';
import { groupingManager } from '@/lib/grouping/manager';
import { defaultConfigs } from '@/lib/grouping/config';
import { authenticateStudent, type UserSession } from '@/lib/auth';
import { lockQuizForGrouping } from '@/lib/grouping/quiz-lock';
import {
  ADMIN_MANAGED_REASON,
  COOLDOWN_REASON,
  activeRuns,
  autoGroupAfterSubmit,
  expireCooldown,
  resetGroupingTables,
  seedAutomaticRunWithTwoGroups,
  seedQuiz,
  snapshotGrouping,
  submit,
} from '@/test/grouping-fixtures';

let currentSession: UserSession | null = null;
vi.mock('@/lib/session', () => ({
  getSession: async () => currentSession,
}));

// Interleavings vary between runs, so each concurrent scenario repeats to make a regression likely to show.
const ITERATIONS = 10;
const STALE_MESSAGE = '分組已更新，請重新整理後再操作';
const twoPerGroup = { ...defaultConfigs.medium, target_group_size: 2 };

function isDeadlock(reason: unknown) {
  const error = reason as { code?: string; cause?: { code?: string } } | undefined;
  return error?.code === '40P01' || error?.cause?.code === '40P01';
}

async function eventStatuses(quizId: string) {
  const events = await db.select().from(groupingEvents).where(eq(groupingEvents.quizId, quizId));
  return events.map((event) => (event.triggerMetadata as Record<string, unknown> | null)?.grouping_status);
}

async function allRuns(quizId: string) {
  return db.select().from(groupingRuns).where(eq(groupingRuns.quizId, quizId));
}

function asAdmin(adminId: string) {
  currentSession = { type: 'admin', id: adminId, name: 'Owner', email: 'owner@example.com' };
}

describe('grouping concurrency', () => {
  beforeEach(async () => {
    currentSession = null;
    await resetGroupingTables();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Grouping changes for a quiz are serialized', () => {
    it('runs an automatic regroup and an admin move at the same time without deadlock', async () => {
      for (let i = 0; i < ITERATIONS; i++) {
        await resetGroupingTables();
        const { adminId, quizId, groupRows, first } = await seedAutomaticRunWithTwoGroups();
        await expireCooldown(quizId);
        const p5 = await submit(quizId, 50);

        const results = await Promise.allSettled([
          autoGroupAfterSubmit(quizId, p5, twoPerGroup),
          groupingManager.moveParticipant(first.participantId, groupRows[1].id, adminId),
        ]);

        for (const result of results) {
          if (result.status === 'rejected') {
            expect(isDeadlock(result.reason), `iteration ${i}: ${String(result.reason)}`).toBe(false);
          }
        }
        expect(await activeRuns(quizId)).toHaveLength(1);
      }
    });

    it('lets a student log in while a grouping operation holds the quiz lock', async () => {
      const { quizId } = await seedQuiz();
      let loginOutcome: string | undefined;

      await db.transaction(async (tx) => {
        await lockQuizForGrouping(tx, quizId);
        // Login runs on another pooled connection; it must finish before this lock is released
        loginOutcome = await Promise.race([
          authenticateStudent('Late Student', 'L001', quizId).then((session) => (session ? 'logged-in' : 'rejected')),
          new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 2000)),
        ]);
      });

      expect(loginOutcome).toBe('logged-in');
    });

    it('creates exactly one run when two submissions reach the threshold together', async () => {
      for (let i = 0; i < ITERATIONS; i++) {
        await resetGroupingTables();
        const { quizId } = await seedQuiz();
        await submit(quizId, 90);
        await submit(quizId, 80);
        const p3 = await submit(quizId, 70);
        const p4 = await submit(quizId, 60);

        await Promise.allSettled([autoGroupAfterSubmit(quizId, p3), autoGroupAfterSubmit(quizId, p4)]);

        expect(await activeRuns(quizId), `iteration ${i}`).toHaveLength(1);
        expect(await eventStatuses(quizId), `iteration ${i}`).not.toContain('failed');
      }
    });
  });

  describe('Concurrent submissions regroup at most once per cooldown', () => {
    it('regroups once for five concurrent submissions after the threshold', async () => {
      for (let i = 0; i < ITERATIONS; i++) {
        await resetGroupingTables();
        const { quizId } = await seedQuiz();
        await submit(quizId, 90);
        await submit(quizId, 80);
        await submit(quizId, 70);
        const burst = [];
        for (const score of [65, 60, 55, 50, 45]) burst.push(await submit(quizId, score));

        const results = await Promise.all(burst.map((participantId) => autoGroupAfterSubmit(quizId, participantId)));

        expect(await allRuns(quizId), `iteration ${i}`).toHaveLength(1);
        expect(results.filter((result) => result.success), `iteration ${i}`).toHaveLength(1);
        const skipped = results.filter((result) => !result.success);
        expect(skipped.map((result) => result.triggerEvaluation?.reason), `iteration ${i}`).toEqual(
          Array(4).fill(COOLDOWN_REASON)
        );
      }
    });
  });

  describe('Admin member edits on replaced groups are rejected', () => {
    // Reads group ids, then lets an automatic regroup replace every group of the quiz.
    async function seedReplacedGroups() {
      const seeded = await seedAutomaticRunWithTwoGroups();
      await expireCooldown(seeded.quizId);
      const p5 = await submit(seeded.quizId, 50);
      const regrouped = await autoGroupAfterSubmit(seeded.quizId, p5, twoPerGroup);
      expect(regrouped.success).toBe(true);
      return seeded;
    }

    it('rejects a move from the group management page with 409', async () => {
      const { adminId, quizId, groupRows, first } = await seedReplacedGroups();
      const before = await snapshotGrouping(quizId);
      asAdmin(adminId);
      const { POST } = await import('@/app/api/admin/groups/move-participant/route');

      const response = await POST(
        new NextRequest('http://localhost/api/admin/groups/move-participant', {
          method: 'POST',
          body: JSON.stringify({ participantId: first.participantId, targetGroupId: groupRows[1].id }),
        })
      );

      expect(response.status).toBe(409);
      expect((await response.json()).message).toBe(STALE_MESSAGE);
      expect(await snapshotGrouping(quizId)).toEqual(before);
    });

    it('rejects removing a member through a replaced group with 409', async () => {
      const { adminId, quizId, groupRows, first } = await seedReplacedGroups();
      const before = await snapshotGrouping(quizId);
      asAdmin(adminId);
      const { PATCH } = await import('@/app/api/admin/groups/[groupId]/members/route');

      const response = await PATCH(
        new NextRequest('http://localhost/api/admin/groups/x/members', {
          method: 'PATCH',
          body: JSON.stringify({ participant_id: first.participantId, new_group_id: null }),
        }),
        { params: Promise.resolve({ groupId: groupRows[0].id }) }
      );

      expect(response.status).toBe(409);
      expect((await response.json()).message).toBe(STALE_MESSAGE);
      expect(await snapshotGrouping(quizId)).toEqual(before);
    });
  });

  describe('Admin-managed quizzes skip automatic grouping cheaply', () => {
    it('records the skip without ranking hashes', async () => {
      const { adminId, quizId } = await seedQuiz();
      await submit(quizId, 90);
      await submit(quizId, 80);
      await submit(quizId, 70);
      await groupingManager.manualGroup(quizId, adminId, defaultConfigs.medium);
      await expireCooldown(quizId);
      await db.delete(groupingEvents).where(eq(groupingEvents.quizId, quizId));

      const p4 = await submit(quizId, 60);
      const result = await autoGroupAfterSubmit(quizId, p4);

      expect(result.triggerEvaluation?.reason).toBe(ADMIN_MANAGED_REASON);
      const [event] = await db.select().from(groupingEvents).where(eq(groupingEvents.quizId, quizId));
      expect((event.triggerMetadata as Record<string, unknown>).grouping_status).toBe('skipped_admin_managed');
      expect(event.oldRankingHash).toBeNull();
      expect(event.newRankingHash).toBeNull();
    });
  });
});

