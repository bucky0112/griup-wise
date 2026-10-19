import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, groupingEvents, groupingRuns, groups, groupMembers, submissions } from '@/lib/db';
import { GroupingManager, editFailureStatus, groupingManager } from '@/lib/grouping/manager';
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

// Lets a test make the next grouping-event write with a given status fail, as a dropped connection would.
const eventWrites = vi.hoisted(() => ({ failStatus: undefined as string | undefined }));
vi.mock('@/lib/grouping/triggers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/grouping/triggers')>();
  return {
    ...actual,
    recordGroupingEvent: async (...args: Parameters<typeof actual.recordGroupingEvent>) => {
      const status = (args[5] as Record<string, unknown> | undefined)?.grouping_status ?? 'not_triggered';
      if (eventWrites.failStatus && status === eventWrites.failStatus) {
        eventWrites.failStatus = undefined;
        throw new Error('simulated event write failure');
      }
      return actual.recordGroupingEvent(...args);
    },
  };
});

// Interleavings vary between runs, so each concurrent scenario repeats to make a regression likely to show.
const ITERATIONS = 10;
// Repeated scenarios rebuild their data every iteration, so they need more than the 5s default.
const REPEATED_TEST_TIMEOUT_MS = 30_000;
const STALE_MESSAGE = '分組已更新，請重新整理後再操作';
const twoPerGroup = { ...defaultConfigs.medium, target_group_size: 2 };

type PerformGrouping = (...args: unknown[]) => Promise<unknown>;
const managerProto = GroupingManager.prototype as unknown as { performGrouping: PerformGrouping };

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
    eventWrites.failStatus = undefined;
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
    }, REPEATED_TEST_TIMEOUT_MS);

    it('lets a student log in and submit while a grouping operation holds the quiz lock', async () => {
      const { quizId } = await seedQuiz();
      let loginOutcome: string | undefined;

      await db.transaction(async (tx) => {
        await lockQuizForGrouping(tx, quizId);
        // Login runs on another pooled connection; it must finish before this lock is released
        loginOutcome = await Promise.race([
          authenticateStudent('Late Student', 'L001', quizId).then(async (result) => {
            if (!result.ok) return 'rejected';
            await db.insert(submissions).values({ quizId, participantId: result.session.participantId, totalScore: '10' });
            return 'logged-in-and-submitted';
          }),
          new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 2000)),
        ]);
      });

      expect(loginOutcome).toBe('logged-in-and-submitted');
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
    }, REPEATED_TEST_TIMEOUT_MS);
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
        expect(results.filter((result) => result.triggerEvaluation?.shouldTrigger), `iteration ${i}`).toHaveLength(1);
        const skippedEvents = (await db.select().from(groupingEvents).where(eq(groupingEvents.quizId, quizId)))
          .filter((event) => (event.triggerMetadata as Record<string, unknown>).grouping_status === 'skipped_cooldown');
        expect(skippedEvents.every((event) => event.newRankingHash === null && event.oldRankingHash === null)).toBe(true);
        const skipped = results.filter((result) => !result.success);
        // A submission can check the cooldown just before the regroup's event lands and then find its
        // ranking already applied; both reasons mean the burst was covered by the single regroup.
        for (const result of skipped) {
          expect([COOLDOWN_REASON, 'No ranking change detected'], `iteration ${i}`).toContain(
            result.triggerEvaluation?.reason
          );
        }
        expect(skipped, `iteration ${i}`).toHaveLength(4);
      }
    }, REPEATED_TEST_TIMEOUT_MS);
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

  describe('Admin member edits: batch move, unknown group ids and archived history', () => {
    it('rejects a batch move to a replaced group with 409', async () => {
      const seeded = await seedAutomaticRunWithTwoGroups();
      await expireCooldown(seeded.quizId);
      const p5 = await submit(seeded.quizId, 50);
      expect((await autoGroupAfterSubmit(seeded.quizId, p5, twoPerGroup)).success).toBe(true);
      const before = await snapshotGrouping(seeded.quizId);
      asAdmin(seeded.adminId);
      const { POST } = await import('@/app/api/admin/groups/batch-move/route');

      const response = await POST(
        new NextRequest('http://localhost/api/admin/groups/batch-move', {
          method: 'POST',
          body: JSON.stringify({ participantIds: [seeded.first.participantId], targetGroupId: seeded.groupRows[1].id }),
        })
      );

      expect(response.status).toBe(409);
      expect((await response.json()).message).toBe(STALE_MESSAGE);
      expect(await snapshotGrouping(seeded.quizId)).toEqual(before);
    });

    it('answers 409 for a group id that is not in the active run, even one that never existed', async () => {
      const { adminId, first } = await seedAutomaticRunWithTwoGroups();
      asAdmin(adminId);
      const { POST } = await import('@/app/api/admin/groups/move-participant/route');

      const response = await POST(
        new NextRequest('http://localhost/api/admin/groups/move-participant', {
          method: 'POST',
          body: JSON.stringify({ participantId: first.participantId, targetGroupId: '00000000-0000-0000-0000-000000000000' }),
        })
      );

      expect(response.status).toBe(409);
      expect((await response.json()).message).toBe(STALE_MESSAGE);
    });

    // Legacy data: a participant whose only membership sits in an archived run.
    async function seedParticipantWithArchivedMembershipOnly() {
      const seeded = await seedAutomaticRunWithTwoGroups();
      const [archivedRun] = await db
        .insert(groupingRuns)
        .values({ quizId: seeded.quizId, createdBy: seeded.adminId, strategy: 'snake_by_score', config: {}, status: 'archived' })
        .returning();
      const [archivedGroup] = await db
        .insert(groups)
        .values({ quizId: seeded.quizId, groupingRunId: archivedRun.id, name: 'old', orderIndex: 99 })
        .returning();
      const ungrouped = await submit(seeded.quizId, 40);
      await db.insert(groupMembers).values({ groupId: archivedGroup.id, participantId: ungrouped, rankIndex: 1 });
      return { ...seeded, ungrouped, archivedGroup };
    }

    it('adds a participant with only archived history to an active group', async () => {
      const { adminId, groupRows, ungrouped, archivedGroup } = await seedParticipantWithArchivedMembershipOnly();

      const moved = await groupingManager.moveParticipant(ungrouped, groupRows[0].id, adminId);

      expect(moved.success).toBe(true);
      const memberships = await db.select().from(groupMembers).where(eq(groupMembers.participantId, ungrouped));
      expect(memberships.map((m) => m.groupId).sort()).toEqual([archivedGroup.id, groupRows[0].id].sort());
    });

    it('refuses to swap with a participant who has only archived history (400)', async () => {
      const { adminId, quizId, first, ungrouped } = await seedParticipantWithArchivedMembershipOnly();
      const before = await snapshotGrouping(quizId);

      const swapped = await groupingManager.swapParticipants(first.participantId, ungrouped, adminId);

      expect(swapped.success).toBe(false);
      expect(editFailureStatus(swapped)).toBe(400);
      expect(await snapshotGrouping(quizId)).toEqual(before);
    });
  });

  describe('Grouping events reflect only applied groupings', () => {
    it('records no ranking hash for a failed attempt', async () => {
      const { quizId } = await seedQuiz();
      await submit(quizId, 90);
      await submit(quizId, 80);
      const p3 = await submit(quizId, 70);
      vi.spyOn(managerProto, 'performGrouping').mockRejectedValueOnce(new Error('simulated grouping failure'));

      await expect(autoGroupAfterSubmit(quizId, p3)).rejects.toThrow('simulated grouping failure');

      const [event] = await db.select().from(groupingEvents).where(eq(groupingEvents.quizId, quizId));
      expect((event.triggerMetadata as Record<string, unknown>).grouping_status).toBe('failed');
      expect(event.newRankingHash).toBeNull();
      expect(event.oldRankingHash).toBeNull();
    });

    it('does not start the cooldown when an admin grouping fails', async () => {
      const { adminId, quizId } = await seedQuiz();
      await submit(quizId, 90);
      await submit(quizId, 80);
      await submit(quizId, 70);
      vi.spyOn(managerProto, 'performGrouping').mockRejectedValueOnce(new Error('simulated grouping failure'));

      await expect(groupingManager.manualGroup(quizId, adminId, defaultConfigs.medium)).rejects.toThrow();

      expect(await eventStatuses(quizId)).toEqual(['failed']);
      const p4 = await submit(quizId, 60);
      const result = await autoGroupAfterSubmit(quizId, p4);
      expect(result.triggerEvaluation?.reason).not.toBe(COOLDOWN_REASON);
      expect(result.success).toBe(true);
    });

    it('keeps reporting success when the event write fails after the regroup committed', async () => {
      const { quizId } = await seedQuiz();
      await submit(quizId, 90);
      await submit(quizId, 80);
      const p3 = await submit(quizId, 70);
      eventWrites.failStatus = 'succeeded';

      const result = await autoGroupAfterSubmit(quizId, p3);

      expect(result.success).toBe(true);
      expect(await activeRuns(quizId)).toHaveLength(1);
    });
  });

  describe('Grouping events: reviews, skipped attempts and failed skip writes', () => {
    it('does not start the cooldown when an answer review records a grouping event', async () => {
      const { quizId } = await seedQuiz();
      await submit(quizId, 90);
      await submit(quizId, 80);
      const reviewed = await submit(quizId, 70);
      // Mirrors src/app/api/admin/reviews/answer/[answerId]/route.ts, which never regroups afterwards
      await db.insert(groupingEvents).values({
        quizId,
        eventType: 'manual_review',
        participantId: reviewed,
        triggerMetadata: { scoreChange: 5 },
        shouldTriggerGrouping: true,
      });

      const p4 = await submit(quizId, 60);
      const result = await autoGroupAfterSubmit(quizId, p4);

      expect(result.triggerEvaluation?.reason).not.toBe(COOLDOWN_REASON);
      expect(result.success).toBe(true);
    });

    it('records an in-lock cooldown skip as non-triggering', async () => {
      const { quizId } = await seedQuiz();
      await submit(quizId, 90);
      await submit(quizId, 80);
      const burst = [];
      for (const score of [70, 65, 60]) burst.push(await submit(quizId, score));

      await Promise.all(burst.map((participantId) => autoGroupAfterSubmit(quizId, participantId)));

      const events = await db.select().from(groupingEvents).where(eq(groupingEvents.quizId, quizId));
      for (const event of events) {
        const status = (event.triggerMetadata as Record<string, unknown>).grouping_status;
        if (status === 'skipped_cooldown' || status === 'skipped_admin_managed') {
          expect(event.shouldTriggerGrouping, String(status)).toBe(false);
        }
      }
    });

    it('still reports the skip when writing a non-triggering event fails', async () => {
      const { quizId } = await seedQuiz();
      const p1 = await submit(quizId, 90);
      eventWrites.failStatus = 'not_triggered';

      const result = await autoGroupAfterSubmit(quizId, p1);

      expect(result.success).toBe(false);
      expect(result.triggerEvaluation?.reason).toContain('Not enough participants');
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

