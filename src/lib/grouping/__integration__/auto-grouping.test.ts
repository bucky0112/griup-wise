import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  db,
  admins,
  classes,
  quizzes,
  participants,
  questions,
  submissions,
  groupingRuns,
  groupingEvents,
  groups,
  groupMembers,
} from '@/lib/db';
import { GroupingManager, groupingManager, markRunAdminManaged } from '@/lib/grouping/manager';
import { defaultConfigs, type GroupingConfig } from '@/lib/grouping/config';
import { truncateTables } from '@/test/db';
import type { UserSession } from '@/lib/auth';

let currentSession: UserSession | null = null;

// performGrouping is private; tests intercept it to simulate failures and concurrent admin edits
type PerformGrouping = (...args: unknown[]) => Promise<unknown>;
const managerProto = GroupingManager.prototype as unknown as { performGrouping: PerformGrouping };
vi.mock('@/lib/session', () => ({
  getSession: async () => currentSession,
}));

const COOLDOWN_REASON = 'In cooldown period (5 minutes)';
const ADMIN_MANAGED_REASON = 'Active grouping is admin-managed';

async function seedQuiz() {
  const [admin] = await db
    .insert(admins)
    .values({ name: 'Owner', email: 'owner@example.com', passwordHash: 'not-a-real-hash' })
    .returning();
  const [klass] = await db
    .insert(classes)
    .values({ title: 'Class', createdBy: admin.id })
    .returning();
  const [quiz] = await db
    .insert(quizzes)
    .values({ title: 'Quiz', classId: klass.id, createdBy: admin.id, isActive: true })
    .returning();
  return { adminId: admin.id, quizId: quiz.id };
}

let studentCounter = 0;

// Inserts a participant with a submission, mirroring what the submit route commits before grouping.
async function submit(quizId: string, score: number) {
  studentCounter += 1;
  const studentNo = `S${String(studentCounter).padStart(3, '0')}`;
  const [participant] = await db
    .insert(participants)
    .values({ quizId, displayName: `Student ${studentCounter}`, studentNo, uniqueKey: `${quizId}:${studentNo}` })
    .returning();
  await db.insert(submissions).values({ quizId, participantId: participant.id, totalScore: String(score) });
  return participant.id;
}

async function addParticipant(quizId: string, displayName: string) {
  studentCounter += 1;
  const studentNo = `S${String(studentCounter).padStart(3, '0')}`;
  const [participant] = await db
    .insert(participants)
    .values({ quizId, displayName, studentNo, uniqueKey: `${quizId}:${studentNo}` })
    .returning();
  return participant;
}

// Seeds an automatic run with two groups so membership edits have somewhere to move participants.
async function seedAutomaticRunWithTwoGroups() {
  const { adminId, quizId } = await seedQuiz();
  const twoPerGroup = { ...defaultConfigs.medium, target_group_size: 2 };
  await submit(quizId, 90);
  await submit(quizId, 80);
  await submit(quizId, 70);
  const p4 = await submit(quizId, 60);
  const created = await autoGroupAfterSubmit(quizId, p4, twoPerGroup);
  expect(created.success).toBe(true);

  const groupRows = await db.select().from(groups).where(eq(groups.quizId, quizId)).orderBy(groups.orderIndex);
  const membersOf = (groupId: string) =>
    db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId));
  const [first] = await membersOf(groupRows[0].id);
  const [second] = await membersOf(groupRows[1].id);
  return { adminId, quizId, groupRows, first, second };
}

// The submit route calls autoGroup with the medium preset after each submission.
function autoGroupAfterSubmit(quizId: string, participantId: string, config: GroupingConfig = defaultConfigs.medium) {
  return groupingManager.autoGroup(quizId, participantId, config);
}

async function activeRuns(quizId: string) {
  return db
    .select()
    .from(groupingRuns)
    .where(and(eq(groupingRuns.quizId, quizId), eq(groupingRuns.status, 'active')));
}

async function snapshotGrouping(quizId: string) {
  const runs = await activeRuns(quizId);
  const groupRows = await db.select().from(groups).where(eq(groups.quizId, quizId));
  const memberRows = await db
    .select({ groupId: groupMembers.groupId, participantId: groupMembers.participantId })
    .from(groupMembers)
    .innerJoin(groups, eq(groupMembers.groupId, groups.id))
    .where(eq(groups.quizId, quizId));
  return {
    runIds: runs.map((run) => run.id).sort(),
    groupIds: groupRows.map((group) => group.id).sort(),
    members: memberRows.map((m) => `${m.groupId}:${m.participantId}`).sort(),
  };
}

// Moves every grouping event out of the 5-minute cooldown window.
async function expireCooldown(quizId: string) {
  await db
    .update(groupingEvents)
    .set({ createdAt: new Date(Date.now() - 6 * 60 * 1000) })
    .where(eq(groupingEvents.quizId, quizId));
}

describe('automatic grouping', () => {
  beforeEach(async () => {
    currentSession = null;
    await truncateTables([
      'group_members',
      'groups',
      'grouping_events',
      'grouping_runs',
      'answers',
      'submissions',
      'participants',
      'questions',
      'quizzes',
      'classes',
      'admins',
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Automatic grouping run attribution', () => {
    it('third submission creates an automatic run owned by the quiz owner', async () => {
      const { adminId, quizId } = await seedQuiz();
      const p1 = await submit(quizId, 90);
      await autoGroupAfterSubmit(quizId, p1);
      const p2 = await submit(quizId, 80);
      await autoGroupAfterSubmit(quizId, p2);
      const p3 = await submit(quizId, 70);

      const result = await autoGroupAfterSubmit(quizId, p3);

      expect(result.success).toBe(true);
      expect(result.groupsCreated).toBeGreaterThan(0);

      const runs = await activeRuns(quizId);
      expect(runs).toHaveLength(1);
      expect(runs[0].createdBy).toBe(adminId);
      expect((runs[0].config as Record<string, unknown>).trigger).toBe('automatic');

      const snapshot = await snapshotGrouping(quizId);
      expect(snapshot.groupIds).toHaveLength(1);
      expect(snapshot.members.map((m) => m.split(':')[1]).sort()).toEqual([p1, p2, p3].sort());
    });
  });

  describe('Submit response reports automatic grouping', () => {
    it('reports triggered, groupsCreated and the reason through POST /api/assignments/submit', async () => {
      const { quizId } = await seedQuiz();
      const [question] = await db
        .insert(questions)
        .values({ quizId, type: 'single', prompt: '1+1=?', options: ['2', '3'], answerKey: ['2'], score: '10', orderIndex: 1 })
        .returning();
      const { POST } = await import('@/app/api/assignments/submit/route');

      const submitAs = async (displayName: string, answer: string) => {
        const participant = await addParticipant(quizId, displayName);
        currentSession = {
          type: 'student',
          participantId: participant.id,
          quizId,
          displayName,
          studentNo: participant.studentNo,
        };
        const response = await POST(
          new NextRequest('http://localhost/api/assignments/submit', {
            method: 'POST',
            body: JSON.stringify({ answers: { [question.id]: answer } }),
          })
        );
        expect(response.status).toBe(200);
        return (await response.json()).autoGrouping;
      };

      expect(await submitAs('A', '2')).toMatchObject({ evaluated: true, triggered: false });
      expect(await submitAs('B', '3')).toMatchObject({ evaluated: true, triggered: false });

      const third = await submitAs('C', '2');
      expect(third).toMatchObject({ evaluated: true, triggered: true });
      expect(third.groupsCreated).toBeGreaterThan(0);

      // An admin edit makes the run admin-managed; after the cooldown the next submission is skipped
      const [group] = await db.select().from(groups).where(eq(groups.quizId, quizId));
      await markRunAdminManaged(db, group.id);
      await expireCooldown(quizId);

      expect(await submitAs('D', '3')).toEqual({
        evaluated: true,
        triggered: false,
        reason: ADMIN_MANAGED_REASON,
        groupsCreated: 0,
      });
    });
  });

  describe('Cooldown only after a successful automatic grouping', () => {
    it('failed attempt does not start cooldown', async () => {
      const { quizId } = await seedQuiz();
      await submit(quizId, 90);
      await submit(quizId, 80);
      const p3 = await submit(quizId, 70);

      vi.spyOn(managerProto, 'performGrouping').mockRejectedValueOnce(
        new Error('simulated grouping failure')
      );
      await expect(autoGroupAfterSubmit(quizId, p3)).rejects.toThrow('simulated grouping failure');

      const [failedEvent] = await db
        .select()
        .from(groupingEvents)
        .where(eq(groupingEvents.quizId, quizId));
      expect((failedEvent.triggerMetadata as Record<string, unknown>).grouping_status).toBe('failed');

      const p4 = await submit(quizId, 60);
      const retry = await autoGroupAfterSubmit(quizId, p4);

      expect(retry.triggerEvaluation?.reason).not.toBe(COOLDOWN_REASON);
      expect(retry.success).toBe(true);
    });

    it('successful attempt starts cooldown', async () => {
      const { quizId } = await seedQuiz();
      await submit(quizId, 90);
      await submit(quizId, 80);
      const p3 = await submit(quizId, 70);
      const first = await autoGroupAfterSubmit(quizId, p3);
      expect(first.success).toBe(true);

      const p4 = await submit(quizId, 60);
      const second = await autoGroupAfterSubmit(quizId, p4);

      expect(second.success).toBe(false);
      expect(second.triggerEvaluation?.reason).toBe(COOLDOWN_REASON);
    });
  });

  describe('Automatic grouping preserves admin-owned groups', () => {
    it('keeps a run created manually by an admin', async () => {
      const { adminId, quizId } = await seedQuiz();
      await submit(quizId, 90);
      await submit(quizId, 80);
      await submit(quizId, 70);
      await groupingManager.manualGroup(quizId, adminId, defaultConfigs.medium);
      await expireCooldown(quizId);
      const before = await snapshotGrouping(quizId);

      const p4 = await submit(quizId, 60);
      const result = await autoGroupAfterSubmit(quizId, p4);

      expect(result.success).toBe(false);
      expect(result.triggerEvaluation?.reason).toBe(ADMIN_MANAGED_REASON);
      expect(await snapshotGrouping(quizId)).toEqual(before);
    });

    it('keeps an automatic run after an admin moves a participant', async () => {
      const { adminId, quizId } = await seedQuiz();
      const twoPerGroup = { ...defaultConfigs.medium, target_group_size: 2 };
      await submit(quizId, 90);
      await submit(quizId, 80);
      await submit(quizId, 70);
      const p4 = await submit(quizId, 60);
      const created = await autoGroupAfterSubmit(quizId, p4, twoPerGroup);
      expect(created.success).toBe(true);

      const groupRows = await db.select().from(groups).where(eq(groups.quizId, quizId));
      const [membership] = await db
        .select()
        .from(groupMembers)
        .where(eq(groupMembers.groupId, groupRows[0].id))
        .limit(1);
      const moved = await groupingManager.moveParticipant(membership.participantId, groupRows[1].id, adminId);
      expect(moved.success).toBe(true);

      const [run] = await activeRuns(quizId);
      expect((run.config as Record<string, unknown>).trigger).toBe('manual_adjusted');

      await expireCooldown(quizId);
      const before = await snapshotGrouping(quizId);
      const p5 = await submit(quizId, 50);
      const result = await autoGroupAfterSubmit(quizId, p5, twoPerGroup);

      expect(result.success).toBe(false);
      expect(result.triggerEvaluation?.reason).toBe(ADMIN_MANAGED_REASON);
      expect(await snapshotGrouping(quizId)).toEqual(before);
    });

    it('marks an automatic run as admin-managed when members are moved through the PATCH route', async () => {
      const { adminId, quizId } = await seedQuiz();
      const twoPerGroup = { ...defaultConfigs.medium, target_group_size: 2 };
      await submit(quizId, 90);
      await submit(quizId, 80);
      await submit(quizId, 70);
      const p4 = await submit(quizId, 60);
      await autoGroupAfterSubmit(quizId, p4, twoPerGroup);

      const groupRows = await db.select().from(groups).where(eq(groups.quizId, quizId));
      const [membership] = await db
        .select()
        .from(groupMembers)
        .where(eq(groupMembers.groupId, groupRows[0].id))
        .limit(1);

      currentSession = { type: 'admin', id: adminId, name: 'Owner', email: 'owner@example.com' };
      const { PATCH } = await import('@/app/api/admin/groups/[groupId]/members/route');
      const response = await PATCH(
        new NextRequest('http://localhost/api/admin/groups/x/members', {
          method: 'PATCH',
          body: JSON.stringify({ participant_id: membership.participantId, new_group_id: groupRows[1].id }),
        }),
        { params: Promise.resolve({ groupId: groupRows[0].id }) }
      );
      expect(response.status).toBe(200);

      const [run] = await activeRuns(quizId);
      expect((run.config as Record<string, unknown>).trigger).toBe('manual_adjusted');
    });

    it('keeps a run that an admin adjusts after the trigger was evaluated', async () => {
      const { quizId } = await seedQuiz();
      await submit(quizId, 90);
      await submit(quizId, 80);
      const p3 = await submit(quizId, 70);
      await autoGroupAfterSubmit(quizId, p3);
      await expireCooldown(quizId);

      // Simulate an admin edit committing between autoGroup's checks and the regroup transaction
      const original = managerProto.performGrouping;
      vi.spyOn(managerProto, 'performGrouping').mockImplementationOnce(async function (this: unknown, ...args: unknown[]) {
        const [run] = await activeRuns(quizId);
        await db
          .update(groupingRuns)
          .set({ config: { ...(run.config as Record<string, unknown>), trigger: 'manual_adjusted' } })
          .where(eq(groupingRuns.id, run.id));
        return original.apply(this, args);
      });
      const before = await snapshotGrouping(quizId);

      const p4 = await submit(quizId, 60);
      const result = await autoGroupAfterSubmit(quizId, p4);

      expect(result.success).toBe(false);
      expect(result.triggerEvaluation?.reason).toBe(ADMIN_MANAGED_REASON);
      expect(await snapshotGrouping(quizId)).toEqual(before);
    });

    it('marks an automatic run as admin-managed when an admin swaps participants', async () => {
      const { adminId, quizId, first, second } = await seedAutomaticRunWithTwoGroups();

      const swapped = await groupingManager.swapParticipants(first.participantId, second.participantId, adminId);

      expect(swapped.success).toBe(true);
      const [run] = await activeRuns(quizId);
      expect((run.config as Record<string, unknown>).trigger).toBe('manual_adjusted');
    });

    it('marks an automatic run as admin-managed when an admin batch-moves participants', async () => {
      const { adminId, quizId, groupRows, first } = await seedAutomaticRunWithTwoGroups();

      const moved = await groupingManager.batchMove([first.participantId], groupRows[1].id, adminId);

      expect(moved.success).toBe(true);
      const [run] = await activeRuns(quizId);
      expect((run.config as Record<string, unknown>).trigger).toBe('manual_adjusted');
    });

    it('refreshes an automatic run that no admin has adjusted', async () => {
      const { quizId } = await seedQuiz();
      await submit(quizId, 90);
      await submit(quizId, 80);
      const p3 = await submit(quizId, 70);
      const first = await autoGroupAfterSubmit(quizId, p3);
      expect(first.success).toBe(true);
      const [firstRun] = await activeRuns(quizId);

      await expireCooldown(quizId);
      const p4 = await submit(quizId, 60);
      const result = await autoGroupAfterSubmit(quizId, p4);

      expect(result.success).toBe(true);
      const [newRun] = await activeRuns(quizId);
      expect(newRun.id).not.toBe(firstRun.id);
      expect((newRun.config as Record<string, unknown>).trigger).toBe('automatic');
      const members = (await snapshotGrouping(quizId)).members.map((m) => m.split(':')[1]);
      expect(members).toContain(p4);
    });
  });
});
