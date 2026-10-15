import { db, groupingRuns, groups, groupMembers, participants, quizzes, submissions } from '../db';
import { eq, and, desc } from 'drizzle-orm';
import type { GroupingConfig } from './config';
import { validateGroupingConfig } from './config';
import { createDeterministicRanking, generateRankingHash } from './ranking';
import { snakeDistribution } from './distribution';
import {
  evaluateSubmissionTrigger,
  recordGroupingEvent,
  triggerManualGrouping,
  defaultTriggerConfig,
  type TriggerEvaluation,
} from './triggers';

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

export interface GroupEditResult {
  success: boolean;
  message: string;
  changedGroups?: string[];
}

export interface BatchOperationResult {
  success: boolean;
  message: string;
  affectedParticipants: number;
  affectedGroups: number;
}

type DbExecutor = Pick<typeof db, 'select' | 'update'>;

class AdminManagedGroupingError extends Error {
  constructor(quizId: string) {
    super(`Active grouping for quiz ${quizId} is admin-managed`);
    this.name = 'AdminManagedGroupingError';
  }
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

  const config = run?.config as Record<string, unknown> | undefined;
  if (!run || config?.trigger !== 'automatic') return;

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

    // Evaluate if grouping should be triggered
    const evaluation = await evaluateSubmissionTrigger(
      quizId,
      participantId,
      validatedConfig,
      defaultTriggerConfig
    );

    const oldHash = await this.getCurrentRankingHash(quizId, validatedConfig);
    const newHash = await this.generateNewRankingHash(quizId, validatedConfig);

    // The event is recorded after the attempt so the cooldown only counts groupings that succeeded
    const recordEvent = (groupingStatus?: 'succeeded' | 'failed' | 'skipped_admin_managed') =>
      recordGroupingEvent(quizId, evaluation, participantId, oldHash, newHash, {
        trigger_type: 'automatic',
        config_used: validatedConfig,
        ...(groupingStatus && { grouping_status: groupingStatus }),
      });

    // If trigger evaluation says not to group, return early
    if (!evaluation.shouldTrigger) {
      await recordEvent();
      return {
        success: false,
        runId: '',
        groupsCreated: 0,
        totalMembers: 0,
        triggerEvaluation: evaluation,
        metadata: {
          strategy: 'snake_by_score',
          config: validatedConfig,
          timestamp: new Date(),
        },
      };
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
      if (error instanceof AdminManagedGroupingError) {
        await recordEvent('skipped_admin_managed');
        return {
          success: false,
          runId: '',
          groupsCreated: 0,
          totalMembers: 0,
          triggerEvaluation: { ...evaluation, shouldTrigger: false, reason: 'Active grouping is admin-managed' },
          metadata: {
            strategy: 'snake_by_score',
            config: validatedConfig,
            timestamp: new Date(),
          },
        };
      }

      await recordEvent('failed');
      throw error;
    }

    await recordEvent('succeeded');
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

    // Always trigger manual grouping
    const evaluation = await triggerManualGrouping(quizId, adminId, reason);

    return await this.performGrouping(quizId, validatedConfig, adminId, evaluation);
  }

  /**
   * Move a participant to a different group
   */
  async moveParticipant(
    participantId: string,
    targetGroupId: string,
    adminId: string
  ): Promise<GroupEditResult> {
    return await db.transaction(async (tx) => {
      // Get current group membership
      const currentMember = await tx
        .select({
          id: groupMembers.id,
          groupId: groupMembers.groupId,
          participantId: groupMembers.participantId,
          rankIndex: groupMembers.rankIndex,
        })
        .from(groupMembers)
        .where(eq(groupMembers.participantId, participantId))
        .limit(1);

      if (currentMember.length === 0) {
        return {
          success: false,
          message: 'Participant not found in any group',
        };
      }

      const oldGroupId = currentMember[0].groupId;

      // Check if target group exists
      const targetGroup = await tx
        .select({ id: groups.id })
        .from(groups)
        .where(eq(groups.id, targetGroupId))
        .limit(1);

      if (targetGroup.length === 0) {
        return {
          success: false,
          message: 'Target group not found',
        };
      }

      // Remove from current group
      await tx
        .delete(groupMembers)
        .where(eq(groupMembers.id, currentMember[0].id));

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
        changedGroups: [oldGroupId, targetGroupId],
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
    return await db.transaction(async (tx) => {
      // Get both participants' current group memberships
      const member1Query = await tx
        .select({
          id: groupMembers.id,
          groupId: groupMembers.groupId,
          participantId: groupMembers.participantId,
          rankIndex: groupMembers.rankIndex,
        })
        .from(groupMembers)
        .where(eq(groupMembers.participantId, participant1Id));

      const member2Query = await tx
        .select({
          id: groupMembers.id,
          groupId: groupMembers.groupId,
          participantId: groupMembers.participantId,
          rankIndex: groupMembers.rankIndex,
        })
        .from(groupMembers)
        .where(eq(groupMembers.participantId, participant2Id));

      const members = [...member1Query, ...member2Query];

      if (members.length !== 2) {
        return {
          success: false,
          message: 'Both participants must be in groups to swap',
        };
      }

      const member1 = members.find(m => m.participantId === participant1Id)!;
      const member2 = members.find(m => m.participantId === participant2Id)!;

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
    participantIds: string[],
    targetGroupId: string,
    adminId: string
  ): Promise<BatchOperationResult> {
    if (participantIds.length === 0) {
      return {
        success: false,
        message: 'No participants provided',
        affectedParticipants: 0,
        affectedGroups: 0,
      };
    }

    return await db.transaction(async (tx) => {
      // Check target group exists
      const targetGroup = await tx
        .select({ id: groups.id })
        .from(groups)
        .where(eq(groups.id, targetGroupId))
        .limit(1);

      if (targetGroup.length === 0) {
        return {
          success: false,
          message: 'Target group not found',
          affectedParticipants: 0,
          affectedGroups: 0,
        };
      }

      // Get current memberships for all participants
      let currentMembers = [];
      for (const participantId of participantIds) {
        const memberQuery = await tx
          .select({
            id: groupMembers.id,
            groupId: groupMembers.groupId,
            participantId: groupMembers.participantId,
          })
          .from(groupMembers)
          .where(eq(groupMembers.participantId, participantId));

        currentMembers.push(...memberQuery);
      }

      const sourceGroupsSet = new Set(currentMembers.map(m => m.groupId));
      const sourceGroups = Array.from(sourceGroupsSet);

      // Remove from current groups
      if (currentMembers.length > 0) {
        await tx
          .delete(groupMembers)
          .where(eq(groupMembers.id, currentMembers[0].id));

        for (let i = 1; i < currentMembers.length; i++) {
          await tx
            .delete(groupMembers)
            .where(eq(groupMembers.id, currentMembers[i].id));
        }
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
      if (trigger === 'automatic') {
        // Lock the active run so an admin edit cannot commit between this check and the regroup;
        // edits update the same row through markRunAdminManaged and wait for this transaction.
        const [activeRun] = await tx
          .select({ config: groupingRuns.config })
          .from(groupingRuns)
          .where(and(eq(groupingRuns.quizId, quizId), eq(groupingRuns.status, 'active')))
          .limit(1)
          .for('update');

        // Runs without trigger "automatic" were created or edited by an admin and must not be replaced
        if (activeRun && (activeRun.config as { trigger?: string } | null)?.trigger !== 'automatic') {
          throw new AdminManagedGroupingError(quizId);
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

  private async generateNewRankingHash(
    quizId: string,
    config: GroupingConfig
  ): Promise<string> {
    // This is the same as getCurrentRankingHash since we want the "new" state
    // In practice, this would be called after a new submission is added
    const hash = await this.getCurrentRankingHash(quizId, config);
    return hash || 'unknown_hash';
  }
}

// Export singleton instance
export const groupingManager = new GroupingManager();