import { db, groupingEvents, submissions, participants } from '../db';
import { eq, and, desc, gt, isNotNull, sql } from 'drizzle-orm';
import type { GroupingConfig } from './config';
import { createDeterministicRanking, generateRankingHash, detectRankingChanges } from './ranking';

export interface GroupingTriggerConfig {
  minParticipantsForTrigger: number;
  rankChangeThreshold: number;
  cooldownMinutes: number;
}

export const defaultTriggerConfig: GroupingTriggerConfig = {
  minParticipantsForTrigger: 3,
  rankChangeThreshold: 3,
  cooldownMinutes: 5,
};

export interface TriggerEvaluation {
  shouldTrigger: boolean;
  reason: string;
  eventType: 'submission' | 'manual_trigger' | 'config_change';
  participantCount: number;
  rankingChanged: boolean;
  inCooldown: boolean;
}

/**
 * Evaluate whether a submission should trigger automatic grouping
 */
export async function evaluateSubmissionTrigger(
  quizId: string,
  participantId: string,
  groupingConfig: GroupingConfig,
  triggerConfig: GroupingTriggerConfig = defaultTriggerConfig
): Promise<TriggerEvaluation> {
  // Get all submissions for ranking calculation
  const submissionsWithParticipants = await db
    .select({
      submission: {
        id: submissions.id,
        quizId: submissions.quizId,
        participantId: submissions.participantId,
        totalScore: submissions.totalScore,
        submittedAt: submissions.submittedAt,
      },
      participant: {
        id: participants.id,
        displayName: participants.displayName,
        studentNo: participants.studentNo,
        quizId: participants.quizId,
      },
    })
    .from(submissions)
    .innerJoin(participants, eq(submissions.participantId, participants.id))
    .where(eq(submissions.quizId, quizId));

  // Get unsubmitted participants if needed
  const unsubmittedParticipants = groupingConfig.include_unsubmitted
    ? await getUnsubmittedParticipants(quizId, submissionsWithParticipants.map(s => s.participant.id))
    : [];

  const participantCount = submissionsWithParticipants.length + unsubmittedParticipants.length;

  // Check minimum participant threshold
  if (participantCount < triggerConfig.minParticipantsForTrigger) {
    return {
      shouldTrigger: false,
      reason: `Not enough participants (${participantCount} < ${triggerConfig.minParticipantsForTrigger})`,
      eventType: 'submission',
      participantCount,
      rankingChanged: false,
      inCooldown: false,
    };
  }

  // Check cooldown period
  const inCooldown = await isInCooldownPeriod(quizId, triggerConfig.cooldownMinutes);
  if (inCooldown) {
    return {
      shouldTrigger: false,
      reason: `In cooldown period (${triggerConfig.cooldownMinutes} minutes)`,
      eventType: 'submission',
      participantCount,
      rankingChanged: false,
      inCooldown: true,
    };
  }

  // Transform submissions to match expected interface
  const transformedSubmissions = submissionsWithParticipants.map(item => ({
    submission: {
      ...item.submission,
      totalScore: Number(item.submission.totalScore), // Convert string to number
    },
    participant: item.participant,
  }));

  // Calculate current ranking
  const currentRanking = createDeterministicRanking(transformedSubmissions, unsubmittedParticipants, groupingConfig);
  const currentHash = generateRankingHash(currentRanking);

  // Get the previous ranking hash from the last event
  // Compare against the last applied ranking; skipped and failed events carry no hash
  const lastEvent = await db
    .select()
    .from(groupingEvents)
    .where(and(eq(groupingEvents.quizId, quizId), isNotNull(groupingEvents.newRankingHash)))
    .orderBy(desc(groupingEvents.createdAt))
    .limit(1);

  const previousHash = lastEvent[0]?.newRankingHash;
  const rankingChanged = previousHash !== currentHash;

  // If ranking hasn't changed significantly, don't trigger
  if (!rankingChanged) {
    return {
      shouldTrigger: false,
      reason: 'No ranking change detected',
      eventType: 'submission',
      participantCount,
      rankingChanged: false,
      inCooldown: false,
    };
  }

  // Check if the ranking change is significant
  if (previousHash && lastEvent[0]) {
    // We need to reconstruct the previous ranking to compare
    // For simplicity, we'll trust that any hash change is significant
    // In a more sophisticated implementation, we'd store and compare actual rankings
    const significantChange = true; // Placeholder for detailed rank change analysis

    if (!significantChange) {
      return {
        shouldTrigger: false,
        reason: 'Ranking change not significant enough',
        eventType: 'submission',
        participantCount,
        rankingChanged: true,
        inCooldown: false,
      };
    }
  }

  // All conditions met - trigger grouping
  return {
    shouldTrigger: true,
    reason: 'Ranking changed significantly with sufficient participants',
    eventType: 'submission',
    participantCount,
    rankingChanged: true,
    inCooldown: false,
  };
}

/**
 * Record a grouping trigger event in the database
 */
export async function recordGroupingEvent(
  quizId: string,
  evaluation: TriggerEvaluation,
  participantId?: string,
  oldRankingHash?: string,
  newRankingHash?: string,
  additionalMetadata?: Record<string, unknown>
): Promise<string> {
  const [event] = await db
    .insert(groupingEvents)
    .values({
      quizId,
      eventType: evaluation.eventType,
      participantId: participantId || null,
      oldRankingHash: oldRankingHash || null,
      newRankingHash: newRankingHash || null,
      shouldTriggerGrouping: evaluation.shouldTrigger,
      triggerMetadata: {
        reason: evaluation.reason,
        participantCount: evaluation.participantCount,
        rankingChanged: evaluation.rankingChanged,
        inCooldown: evaluation.inCooldown,
        ...additionalMetadata,
      },
    })
    .returning({ id: groupingEvents.id });

  return event.id;
}

/**
 * Evaluate and record a manual grouping trigger
 */
export function manualTriggerEvaluation(reason: string = 'Manual admin trigger'): TriggerEvaluation {
  return {
    shouldTrigger: true,
    reason,
    eventType: 'manual_trigger',
    participantCount: 0,
    rankingChanged: false,
    inCooldown: false,
  };
}

/**
 * Record a manual grouping trigger after the attempt, with its outcome
 */
export async function triggerManualGrouping(
  quizId: string,
  adminId: string,
  reason: string = 'Manual admin trigger',
  groupingStatus?: 'succeeded' | 'failed'
): Promise<TriggerEvaluation> {
  const evaluation = manualTriggerEvaluation(reason);

  await recordGroupingEvent(quizId, evaluation, undefined, undefined, undefined, {
    triggeredBy: adminId,
    manualTrigger: true,
    ...(groupingStatus && { grouping_status: groupingStatus }),
  });

  return evaluation;
}

// Start of the cooldown window, computed by PostgreSQL so app/database clock skew cannot shift it.
export function cooldownStartSql(cooldownMinutes: number) {
  return sql`now() - make_interval(mins => ${cooldownMinutes})`;
}

/**
 * Check if the quiz is in cooldown period for automatic triggers
 */
async function isInCooldownPeriod(quizId: string, cooldownMinutes: number): Promise<boolean> {
  const recentEvents = await db
    .select({ id: groupingEvents.id })
    .from(groupingEvents)
    .where(
      and(
        eq(groupingEvents.quizId, quizId),
        eq(groupingEvents.shouldTriggerGrouping, true),
        // Only attempts that regrouped start the cooldown; events without a status predate grouping_status
        sql`coalesce(${groupingEvents.triggerMetadata}->>'grouping_status', 'succeeded') = 'succeeded'`,
        // The database clock wrote created_at, so it also measures the window
        gt(groupingEvents.createdAt, cooldownStartSql(cooldownMinutes))
      )
    )
    .limit(1);

  return recentEvents.length > 0;
}

/**
 * Get participants who haven't submitted yet
 */
async function getUnsubmittedParticipants(
  quizId: string,
  submittedParticipantIds: string[]
): Promise<Array<{
  id: string;
  displayName: string;
  studentNo: string;
  quizId: string;
}>> {
  const allParticipants = await db
    .select()
    .from(participants)
    .where(eq(participants.quizId, quizId));

  return allParticipants.filter(p => !submittedParticipantIds.includes(p.id));
}

/**
 * Get recent grouping events for a quiz
 */
export async function getRecentGroupingEvents(
  quizId: string,
  limit: number = 10
): Promise<typeof groupingEvents.$inferSelect[]> {
  return await db
    .select()
    .from(groupingEvents)
    .where(eq(groupingEvents.quizId, quizId))
    .orderBy(desc(groupingEvents.createdAt))
    .limit(limit);
}

/**
 * Check if automatic grouping should be triggered for a config change
 */
export async function evaluateConfigChangeTrigger(
  quizId: string,
  newConfig: GroupingConfig,
  oldConfig?: GroupingConfig
): Promise<TriggerEvaluation> {
  // Config changes always trigger unless in cooldown
  const inCooldown = await isInCooldownPeriod(quizId, defaultTriggerConfig.cooldownMinutes);

  if (inCooldown) {
    return {
      shouldTrigger: false,
      reason: `Config change during cooldown period`,
      eventType: 'config_change',
      participantCount: 0,
      rankingChanged: false,
      inCooldown: true,
    };
  }

  return {
    shouldTrigger: true,
    reason: 'Grouping configuration changed',
    eventType: 'config_change',
    participantCount: 0,
    rankingChanged: false,
    inCooldown: false,
  };
}