import { db, groupingRuns, groups, groupMembers, participants, quizzes, submissions } from '../db';
import { eq, and, count, desc, gt, inArray, sql } from 'drizzle-orm';
import type { GroupingConfig } from './config';
import { validateGroupingConfig } from './config';
import { createDeterministicRanking, generateRankingHash } from './ranking';
import { snakeDistribution } from './distribution';
import {
  evaluateSubmissionTrigger,
  recordGroupingEvent,
  triggerManualGrouping,
  manualTriggerEvaluation,
  cooldownStartSql,
  defaultTriggerConfig,
  type TriggerEvaluation,
} from './triggers';
import { lockQuizForGrouping } from './quiz-lock';

export interface GroupingResult {
  success: boolean;
  runId: string;
  groupsCreated: number;
  totalMembers: number;
  triggerEvaluation?: TriggerEvaluation;
  metadata: {
    strategy: string;
    config: GroupingConfig;
    timestamp: Date;
  };
}

type EditFailureReason = 'stale_grouping';

export interface GroupEditResult {
  success: boolean;
  message: string;
  changedGroups?: string[];
  reason?: EditFailureReason;
}

export interface BatchOperationResult {
  success: boolean;
  message: string;
  affectedParticipants: number;
  affectedGroups: number;
  reason?: EditFailureReason;
}

export const STALE_GROUPING_MESSAGE = '分組已更新，請重新整理後再操作';

// Member-edit routes answer 409 when a named group is not in the active run. Replaced groups are deleted
// by the regroup, so a replaced id and an id that never existed look the same and both get 409.
export function editFailureStatus(result: { reason?: EditFailureReason }): 400 | 409 {
  return result.reason === 'stale_grouping' ? 409 : 400;
}

const staleEdit = (): GroupEditResult => ({ success: false, message: STALE_GROUPING_MESSAGE, reason: 'stale_grouping' });
const staleBatch = (): BatchOperationResult => ({ ...staleEdit(), affectedParticipants: 0, affectedGroups: 0 });

type DbExecutor = Pick<typeof db, 'select' | 'update'>;

const ADMIN_MANAGED_REASON = 'Active grouping is admin-managed';
const COOLDOWN_REASON = `In cooldown period (${defaultTriggerConfig.cooldownMinutes} minutes)`;

type SkippedStatus = 'skipped_admin_managed' | 'skipped_cooldown';

// Raised inside the locked regroup transaction when the regroup must not run; nothing has been written yet.
class GroupingSkippedError extends Error {
  constructor(readonly status: SkippedStatus, readonly reason: string) {
    super(reason);
    this.name = 'GroupingSkippedError';
  }
}

// Grouping events are an audit trail; a failure to write one is logged instead of masking the real outcome.
async function recordEventSafely(write: () => Promise<unknown>): Promise<void> {
  try {
    await write();
  } catch (error) {
    console.error('Failed to record grouping event:', error);
  }
}

// A participant's quiz never changes, so it can be read before the transaction to know which quiz to lock.
async function quizIdOfParticipants(participantIds: string[]): Promise<string | null> {
  const rows = await db
    .select({ quizId: participants.quizId })
    .from(participants)
    .where(inArray(participants.id, participantIds));
  const quizIds = new Set(rows.map((row) => row.quizId));
  return rows.length === new Set(participantIds).size && quizIds.size === 1 ? [...quizIds][0] : null;
}

// Group ids of the quiz's active run; read after lockQuizForGrouping so it cannot change during the edit.
export async function activeGroupIds(executor: DbExecutor, quizId: string): Promise<Set<string>> {
  const rows = await executor
    .select({ id: groups.id })
    .from(groups)
    .innerJoin(groupingRuns, eq(groups.groupingRunId, groupingRuns.id))
    .where(and(eq(groups.quizId, quizId), eq(groupingRuns.status, 'active')));
  return new Set(rows.map((row) => row.id));
}

// A run is admin-managed unless it was created automatically and never edited by an admin.
function isAutomaticRun(config: unknown): boolean {
  return (config as { trigger?: string } | null)?.trigger === 'automatic';
}

async function isActiveRunAdminManaged(executor: DbExecutor, quizId: string): Promise<boolean> {
  const [activeRun] = await executor
    .select({ config: groupingRuns.config })
    .from(groupingRuns)
    .where(and(eq(groupingRuns.quizId, quizId), eq(groupingRuns.status, 'active')))
    .limit(1);
  return !!activeRun && !isAutomaticRun(activeRun.config);
}

function skippedResult(evaluation: TriggerEvaluation, config: GroupingConfig): GroupingResult {
  return {
    success: false,
    runId: '',
    groupsCreated: 0,
    totalMembers: 0,
    triggerEvaluation: evaluation,
    metadata: {
      strategy: 'snake_by_score',
      config,
      timestamp: new Date(),
    },
  };
}

/**
 * Membership edits make an automatic run admin-managed so later submissions no longer replace it.
 * Call it inside the same transaction as the edit.
 */
export async function markRunAdminManaged(executor: DbExecutor, groupId: string): Promise<void> {
  const [run] = await executor
    .select({ id: groupingRuns.id, config: groupingRuns.config })
    .from(groups)
    .innerJoin(groupingRuns, eq(groups.groupingRunId, groupingRuns.id))
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!run || !isAutomaticRun(run.config)) return;
  const config = run.config as Record<string, unknown>;

  await executor
    .update(groupingRuns)
    .set({ config: { ...config, trigger: 'manual_adjusted' } })
    .where(eq(groupingRuns.id, run.id));
}

/**
 * Unified grouping management system
 */
export class GroupingManager {
  /**
   * Perform automatic grouping with trigger evaluation
   */
  async autoGroup(
    quizId: string,
    participantId: string,
    config: GroupingConfig
  ): Promise<GroupingResult> {
    // Validate configuration
    const validatedConfig = validateGroupingConfig(config);

    // Admin-managed quizzes are never regrouped automatically, so skip before any ranking work.
    // The locked check in performGrouping still catches runs that become admin-managed after this read.
    if (await isActiveRunAdminManaged(db, quizId)) {
      const [{ submittedCount }] = await db
        .select({ submittedCount: count() })
        .from(submissions)
        .where(eq(submissions.quizId, quizId));
      const skipped: TriggerEvaluation = {
        shouldTrigger: false,
        reason: ADMIN_MANAGED_REASON,
        eventType: 'submission',
        participantCount: submittedCount,
        rankingChanged: false,
        inCooldown: false,
      };
      await recordGroupingEvent(quizId, skipped, participantId, undefined, undefined, {
        trigger_type: 'automatic',
        config_used: validatedConfig,
        grouping_status: 'skipped_admin_managed',
      });
      return skippedResult(skipped, validatedConfig);
    }

    // Evaluate if grouping should be triggered
    const evaluation = await evaluateSubmissionTrigger(
      quizId,
      participantId,
      validatedConfig,
      defaultTriggerConfig
    );

    // The submission is already committed, so the current ranking is both the previous and the new state
    const rankingHash = await this.getCurrentRankingHash(quizId, validatedConfig);

    // The event is recorded after the attempt so the cooldown only counts groupings that succeeded.
    // Only an applied regroup records ranking hashes, so later change detection compares against it.
    const recordEvent = (groupingStatus?: 'succeeded' | 'failed' | SkippedStatus) => {
      const applied = groupingStatus === 'succeeded';
      return recordGroupingEvent(
        quizId,
        evaluation,
        participantId,
        applied ? rankingHash : undefined,
        applied ? rankingHash : undefined,
        {
          trigger_type: 'automatic',
          config_used: validatedConfig,
          ...(groupingStatus && { grouping_status: groupingStatus }),
        }
      );
    };

    // If trigger evaluation says not to group, return early
    if (!evaluation.shouldTrigger) {
      await recordEvent();
      return skippedResult(evaluation, validatedConfig);
    }

    let result: GroupingResult;
    try {
      // grouping_runs.created_by must reference an admin, so automatic runs are attributed to the quiz owner
      const [quiz] = await db
        .select({ createdBy: quizzes.createdBy })
        .from(quizzes)
        .where(eq(quizzes.id, quizId))
        .limit(1);

      if (!quiz) {
        throw new Error(`Quiz ${quizId} not found for automatic grouping`);
      }

      result = await this.performGrouping(quizId, validatedConfig, quiz.createdBy, evaluation, 'automatic');
    } catch (error) {
      if (error instanceof GroupingSkippedError) {
        await recordEvent(error.status);
        return skippedResult({ ...evaluation, shouldTrigger: false, reason: error.reason }, validatedConfig);
      }

      await recordEventSafely(() => recordEvent('failed'));
      throw error;
    }

    // The regroup is committed; failing to log it must not turn the result into a failure
    await recordEventSafely(() => recordEvent('succeeded'));
    return result;
  }

  /**
   * Manually trigger grouping (admin action)
   */
  async manualGroup(
    quizId: string,
    adminId: string,
    config: GroupingConfig,
    reason: string = 'Manual admin trigger'
  ): Promise<GroupingResult> {
    const validatedConfig = validateGroupingConfig(config);
    const evaluation = manualTriggerEvaluation(reason);

    // Recorded after the attempt so a failed admin grouping does not start the automatic cooldown
    let result: GroupingResult;
    try {
      result = await this.performGrouping(quizId, validatedConfig, adminId, evaluation);
    } catch (error) {
      await recordEventSafely(() => triggerManualGrouping(quizId, adminId, reason, 'failed'));
      throw error;
    }

    await recordEventSafely(() => triggerManualGrouping(quizId, adminId, reason, 'succeeded'));
    return result;
  }

  /**
   * Move a participant to a different group
   */
  async moveParticipant(
    participantId: string,
    targetGroupId: string,
    adminId: string
  ): Promise<GroupEditResult> {
    const quizId = await quizIdOfParticipants([participantId]);
    if (!quizId) {
      return { success: false, message: 'Participant not found' };
    }

    return await db.transaction(async (tx) => {
      await lockQuizForGrouping(tx, quizId);
      const groupIds = await activeGroupIds(tx, quizId);

      // Ids read before an automatic regroup point at replaced groups; refuse instead of editing them
      if (!groupIds.has(targetGroupId)) {
        return staleEdit();
      }

      // Memberships in archived runs are history; without an active one the participant is ungrouped
      const memberships = await tx
        .select({ id: groupMembers.id, groupId: groupMembers.groupId })
        .from(groupMembers)
        .where(eq(groupMembers.participantId, participantId));
      const currentMember = memberships.find((membership) => groupIds.has(membership.groupId));

      if (currentMember) {
        await tx
          .delete(groupMembers)
          .where(eq(groupMembers.id, currentMember.id));
      }

      // Get next rank index for target group
      const targetGroupMembers = await tx
        .select({ rankIndex: groupMembers.rankIndex })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, targetGroupId))
        .orderBy(desc(groupMembers.rankIndex))
        .limit(1);

      const nextRankIndex = targetGroupMembers.length > 0
        ? targetGroupMembers[0].rankIndex + 1
        : 1;

      // Add to target group
      await tx
        .insert(groupMembers)
        .values({
          groupId: targetGroupId,
          participantId: participantId,
          rankIndex: nextRankIndex,
        });

      await markRunAdminManaged(tx, targetGroupId);

      return {
        success: true,
        message: 'Participant moved successfully',
        changedGroups: currentMember ? [currentMember.groupId, targetGroupId] : [targetGroupId],
      };
    });
  }

  /**
   * Swap two participants between groups
   */
  async swapParticipants(
    participant1Id: string,
    participant2Id: string,
    adminId: string
  ): Promise<GroupEditResult> {
    const quizId = await quizIdOfParticipants([participant1Id, participant2Id]);
    if (!quizId) {
      return { success: false, message: 'Both participants must be in groups to swap' };
    }

    return await db.transaction(async (tx) => {
      await lockQuizForGrouping(tx, quizId);
      const groupIds = await activeGroupIds(tx, quizId);

      const memberships = await tx
        .select({ id: groupMembers.id, groupId: groupMembers.groupId, participantId: groupMembers.participantId })
        .from(groupMembers)
        .where(inArray(groupMembers.participantId, [participant1Id, participant2Id]));
      const activeMemberOf = (participantId: string) =>
        memberships.find((m) => m.participantId === participantId && groupIds.has(m.groupId));

      const member1 = activeMemberOf(participant1Id);
      const member2 = activeMemberOf(participant2Id);

      if (!member1 || !member2) {
        return { success: false, message: 'Both participants must be in groups to swap' };
      }

      // Update group memberships (swap groups but keep rank indices)
      await tx
        .update(groupMembers)
        .set({ groupId: member2.groupId })
        .where(eq(groupMembers.id, member1.id));

      await tx
        .update(groupMembers)
        .set({ groupId: member1.groupId })
        .where(eq(groupMembers.id, member2.id));

      await markRunAdminManaged(tx, member1.groupId);

      return {
        success: true,
        message: 'Participants swapped successfully',
        changedGroups: [member1.groupId, member2.groupId],
      };
    });
  }

  /**
   * Batch move participants to a target group
   */
  async batchMove(
    requestedParticipantIds: string[],
    targetGroupId: string,
    adminId: string
  ): Promise<BatchOperationResult> {
    // Duplicate ids would otherwise insert duplicate memberships
    const participantIds = [...new Set(requestedParticipantIds)];

    if (participantIds.length === 0) {
      return {
        success: false,
        message: 'No participants provided',
        affectedParticipants: 0,
        affectedGroups: 0,
      };
    }

    const quizId = await quizIdOfParticipants(participantIds);
    if (!quizId) {
      return {
        success: false,
        message: 'Participants must belong to one quiz',
        affectedParticipants: 0,
        affectedGroups: 0,
      };
    }

    return await db.transaction(async (tx) => {
      await lockQuizForGrouping(tx, quizId);
      const groupIds = await activeGroupIds(tx, quizId);

      if (!groupIds.has(targetGroupId)) {
        return staleBatch();
      }

      // Only memberships in the active run are moved; older runs keep their history
      const currentMembers = (await tx
        .select({ id: groupMembers.id, groupId: groupMembers.groupId })
        .from(groupMembers)
        .where(inArray(groupMembers.participantId, participantIds)))
        .filter((membership) => groupIds.has(membership.groupId));

      const sourceGroups = Array.from(new Set(currentMembers.map(m => m.groupId)));

      if (currentMembers.length > 0) {
        await tx
          .delete(groupMembers)
          .where(inArray(groupMembers.id, currentMembers.map(m => m.id)));
      }

      // Get next rank index for target group
      const targetGroupMembers = await tx
        .select({ rankIndex: groupMembers.rankIndex })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, targetGroupId))
        .orderBy(desc(groupMembers.rankIndex))
        .limit(1);

      let nextRankIndex = targetGroupMembers.length > 0
        ? targetGroupMembers[0].rankIndex + 1
        : 1;

      // Add all to target group
      const newMemberships = participantIds.map(participantId => ({
        groupId: targetGroupId,
        participantId: participantId,
        rankIndex: nextRankIndex++,
      }));

      await tx.insert(groupMembers).values(newMemberships);

      await markRunAdminManaged(tx, targetGroupId);

      return {
        success: true,
        message: `Moved ${participantIds.length} participants successfully`,
        affectedParticipants: participantIds.length,
        affectedGroups: sourceGroups.length + 1, // Source groups + target group
      };
    });
  }

  /**
   * Get current grouping state for a quiz
   */
  async getCurrentGrouping(quizId: string) {
    const activeRun = await db
      .select()
      .from(groupingRuns)
      .where(and(
        eq(groupingRuns.quizId, quizId),
        eq(groupingRuns.status, 'active')
      ))
      .limit(1);

    if (activeRun.length === 0) {
      return null;
    }

    const groupData = await db
      .select({
        group: groups,
        member: groupMembers,
        participant: participants,
        submission: submissions,
      })
      .from(groups)
      .leftJoin(groupMembers, eq(groups.id, groupMembers.groupId))
      .leftJoin(participants, eq(groupMembers.participantId, participants.id))
      .leftJoin(submissions, eq(participants.id, submissions.participantId))
      .where(eq(groups.groupingRunId, activeRun[0].id));

    return {
      run: activeRun[0],
      groups: groupData,
    };
  }

  /**
   * Core grouping logic
   */
  private async performGrouping(
    quizId: string,
    config: GroupingConfig,
    createdBy: string,
    triggerEvaluation: TriggerEvaluation,
    trigger?: 'automatic'
  ): Promise<GroupingResult> {
    return await db.transaction(async (tx) => {
      await lockQuizForGrouping(tx, quizId);

      if (trigger === 'automatic') {
        // Read under the quiz lock, so no admin edit can commit between this check and the regroup
        if (await isActiveRunAdminManaged(tx, quizId)) {
          throw new GroupingSkippedError('skipped_admin_managed', ADMIN_MANAGED_REASON);
        }

        // Submissions that passed the event-based cooldown while another regroup was running see its run here
        const [recentAutomaticRun] = await tx
          .select({ id: groupingRuns.id })
          .from(groupingRuns)
          .where(and(
            eq(groupingRuns.quizId, quizId),
            gt(groupingRuns.createdAt, cooldownStartSql(defaultTriggerConfig.cooldownMinutes)),
            sql`${groupingRuns.config}->>'trigger' = 'automatic'`
          ))
          .limit(1);

        if (recentAutomaticRun) {
          throw new GroupingSkippedError('skipped_cooldown', COOLDOWN_REASON);
        }
      }

      // Get participants and submissions
      const allParticipants = await tx
        .select({
          id: participants.id,
          displayName: participants.displayName,
          studentNo: participants.studentNo,
          quizId: participants.quizId,
        })
        .from(participants)
        .where(eq(participants.quizId, quizId));

      const submissionsData = await tx
        .select()
        .from(submissions)
        .where(eq(submissions.quizId, quizId));

      // Convert to format expected by ranking algorithm
      const submissionsWithParticipants = submissionsData.map(sub => {
        const participant = allParticipants.find(p => p.id === sub.participantId)!;
        return {
          submission: {
            id: sub.id,
            quizId: sub.quizId,
            participantId: sub.participantId,
            totalScore: Number(sub.totalScore),
            submittedAt: sub.submittedAt,
          },
          participant,
        };
      });

      const unsubmittedParticipants = allParticipants.filter(
        p => !submissionsData.some(s => s.participantId === p.id)
      );

      // Create ranking
      const ranking = createDeterministicRanking(
        submissionsWithParticipants,
        unsubmittedParticipants,
        config
      );

      // Perform snake distribution
      const distributionResult = snakeDistribution(ranking, config);

      // Get existing active groups to delete
      const existingGroups = await tx
        .select({ id: groups.id })
        .from(groups)
        .leftJoin(groupingRuns, eq(groups.groupingRunId, groupingRuns.id))
        .where(and(
          eq(groupingRuns.quizId, quizId),
          eq(groupingRuns.status, 'active')
        ));

      // Delete existing group members and groups (due to foreign key constraint)
      if (existingGroups.length > 0) {
        const groupIds = existingGroups.map(g => g.id);

        // Delete all group members for existing groups
        for (const groupId of groupIds) {
          await tx
            .delete(groupMembers)
            .where(eq(groupMembers.groupId, groupId));
        }

        // Delete all existing groups
        for (const groupId of groupIds) {
          await tx
            .delete(groups)
            .where(eq(groups.id, groupId));
        }
      }

      // Archive existing active runs
      await tx
        .update(groupingRuns)
        .set({ status: 'archived' })
        .where(and(
          eq(groupingRuns.quizId, quizId),
          eq(groupingRuns.status, 'active')
        ));

      // Create new grouping run
      const newRun = await tx
        .insert(groupingRuns)
        .values({
          quizId,
          createdBy,
          strategy: 'snake_by_score',
          config: {
            target_group_size: config.target_group_size,
            include_unsubmitted: config.include_unsubmitted,
            min_groups: config.min_groups,
            max_groups: config.max_groups,
            tie_breaker: config.tie_breaker,
            sort_order: config.sort_order,
            // Runs without a trigger were created by an admin and must not be replaced automatically
            ...(trigger && { trigger }),
          },
          status: 'active',
        })
        .returning();

      const runId = newRun[0].id;

      // Create groups and members
      let totalMembers = 0;
      for (let i = 0; i < distributionResult.groups.length; i++) {
        const group = distributionResult.groups[i];

        // Create group
        const newGroup = await tx
          .insert(groups)
          .values({
            quizId,
            groupingRunId: runId,
            name: group.groupName,
            orderIndex: group.groupIndex + 1,
          })
          .returning();

        const groupId = newGroup[0].id;

        // Add members
        if (group.participants.length > 0) {
          const membersData = group.participants.map(assignment => ({
            groupId,
            participantId: assignment.participant.participant.id,
            rankIndex: assignment.rankIndex + 1,
          }));

          await tx.insert(groupMembers).values(membersData);
          totalMembers += group.participants.length;
        }
      }

      return {
        success: true,
        runId: runId,
        groupsCreated: distributionResult.groups.length,
        totalMembers,
        triggerEvaluation,
        metadata: {
          strategy: 'snake_by_score',
          config,
          timestamp: new Date(),
        },
      };
    });
  }

  private async getCurrentRankingHash(
    quizId: string,
    config: GroupingConfig
  ): Promise<string | undefined> {
    try {
      // Get participants and submissions for current ranking
      const allParticipants = await db
        .select({
          id: participants.id,
          displayName: participants.displayName,
          studentNo: participants.studentNo,
          quizId: participants.quizId,
        })
        .from(participants)
        .where(eq(participants.quizId, quizId));

      const submissionsData = await db
        .select()
        .from(submissions)
        .where(eq(submissions.quizId, quizId));

      const submissionsWithParticipants = submissionsData.map(sub => {
        const participant = allParticipants.find(p => p.id === sub.participantId)!;
        return {
          submission: {
            id: sub.id,
            quizId: sub.quizId,
            participantId: sub.participantId,
            totalScore: Number(sub.totalScore),
            submittedAt: sub.submittedAt,
          },
          participant,
        };
      });

      const unsubmittedParticipants = allParticipants.filter(
        p => !submissionsData.some(s => s.participantId === p.id)
      );

      const ranking = createDeterministicRanking(
        submissionsWithParticipants,
        unsubmittedParticipants,
        config
      );

      return generateRankingHash(ranking);
    } catch (error) {
      console.error('Error generating current ranking hash:', error);
      return undefined;
    }
  }
}

// Export singleton instance
export const groupingManager = new GroupingManager();