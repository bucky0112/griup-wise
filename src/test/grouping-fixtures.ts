import { expect } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  db,
  admins,
  classes,
  quizzes,
  participants,
  submissions,
  groupingRuns,
  groupingEvents,
  groups,
  groupMembers,
} from '@/lib/db';
import { groupingManager } from '@/lib/grouping/manager';
import { defaultConfigs, type GroupingConfig } from '@/lib/grouping/config';
import { truncateTables } from '@/test/db';

export const GROUPING_TABLES = [
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
];

export function resetGroupingTables() {
  return truncateTables(GROUPING_TABLES);
}

export const COOLDOWN_REASON = 'In cooldown period (5 minutes)';
export const ADMIN_MANAGED_REASON = 'Active grouping is admin-managed';

export async function seedQuiz() {
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
export async function submit(quizId: string, score: number) {
  studentCounter += 1;
  const studentNo = `S${String(studentCounter).padStart(3, '0')}`;
  const [participant] = await db
    .insert(participants)
    .values({ quizId, displayName: `Student ${studentCounter}`, studentNo, uniqueKey: `${quizId}:${studentNo}` })
    .returning();
  await db.insert(submissions).values({ quizId, participantId: participant.id, totalScore: String(score) });
  return participant.id;
}

export async function addParticipant(quizId: string, displayName: string) {
  studentCounter += 1;
  const studentNo = `S${String(studentCounter).padStart(3, '0')}`;
  const [participant] = await db
    .insert(participants)
    .values({ quizId, displayName, studentNo, uniqueKey: `${quizId}:${studentNo}` })
    .returning();
  return participant;
}

// Seeds an automatic run with two groups so membership edits have somewhere to move participants.
export async function seedAutomaticRunWithTwoGroups() {
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
export function autoGroupAfterSubmit(quizId: string, participantId: string, config: GroupingConfig = defaultConfigs.medium) {
  return groupingManager.autoGroup(quizId, participantId, config);
}

export async function activeRuns(quizId: string) {
  return db
    .select()
    .from(groupingRuns)
    .where(and(eq(groupingRuns.quizId, quizId), eq(groupingRuns.status, 'active')));
}

export async function snapshotGrouping(quizId: string) {
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

// Moves every grouping event and run out of the 5-minute cooldown window.
export async function expireCooldown(quizId: string) {
  const past = new Date(Date.now() - 6 * 60 * 1000);
  await db.update(groupingEvents).set({ createdAt: past }).where(eq(groupingEvents.quizId, quizId));
  await db.update(groupingRuns).set({ createdAt: past }).where(eq(groupingRuns.quizId, quizId));
}
