import type { GroupingConfig } from './config';

// Interface for submission with participant data
export interface SubmissionWithParticipant {
  submission: {
    id: string;
    quizId: string;
    participantId: string;
    totalScore: number;
    submittedAt: Date;
  };
  participant: {
    id: string;
    displayName: string;
    studentNo: string;
    quizId: string;
  };
}

// Result of ranking with tie-break metadata
export interface RankedParticipant {
  participant: {
    id: string;
    displayName: string;
    studentNo: string;
    quizId: string;
  };
  score: number;
  rank: number;
  tieBreakInfo: string;
  submittedAt: Date;
}

// Interface for unsubmitted participants
export interface UnsubmittedParticipant {
  participant: {
    id: string;
    displayName: string;
    studentNo: string;
    quizId: string;
  };
  score: number; // Always 0 for unsubmitted
  rank: number;
  tieBreakInfo: string;
  submittedAt: Date | null; // null for unsubmitted
}

export type AllParticipants = RankedParticipant | UnsubmittedParticipant;

/**
 * Create deterministic ranking with clear tie-breaking rules
 *
 * Sorting rules (per spec):
 * 1. Total score (descending)
 * 2. Tie-breaker based on config:
 *    - 'submission_time': Earlier submission time wins
 *    - 'student_no': Alphabetical order by student number
 * 3. Final tie-breaker: Student number (for consistency)
 */
export function createDeterministicRanking(
  submissions: SubmissionWithParticipant[],
  unsubmittedParticipants: Array<{
    id: string;
    displayName: string;
    studentNo: string;
    quizId: string;
  }>,
  config: GroupingConfig
): AllParticipants[] {
  const rankedSubmissions: RankedParticipant[] = submissions
    .map((item) => ({
      participant: item.participant,
      score: item.submission.totalScore,
      rank: 0, // Will be set after sorting
      tieBreakInfo: '',
      submittedAt: item.submission.submittedAt,
    }))
    .sort((a, b) => {
      // Primary sort: Score (descending)
      if (a.score !== b.score) {
        return b.score - a.score;
      }

      // Secondary sort: Tie breaker
      if (config.tie_breaker === 'submission_time') {
        const timeDiff = a.submittedAt.getTime() - b.submittedAt.getTime();
        if (timeDiff !== 0) {
          return timeDiff; // Earlier submission wins (ascending time)
        }
      }

      // Final tie breaker: Student number (always applied for consistency)
      return a.participant.studentNo.localeCompare(b.participant.studentNo);
    });

  // Assign ranks and tie-break info
  rankedSubmissions.forEach((participant, index) => {
    participant.rank = index + 1;
    participant.tieBreakInfo = generateTieBreakInfo(participant, config.tie_breaker);
  });

  // Handle unsubmitted participants if included
  const rankedUnsubmitted: UnsubmittedParticipant[] = [];
  if (config.include_unsubmitted) {
    const unsubmittedRanked = unsubmittedParticipants
      .map((participant) => ({
        participant,
        score: 0,
        rank: 0, // Will be set after sorting
        tieBreakInfo: '',
        submittedAt: null,
      }))
      .sort((a, b) => {
        // Sort unsubmitted by student number only
        return a.participant.studentNo.localeCompare(b.participant.studentNo);
      });

    // Assign ranks starting after submitted participants
    unsubmittedRanked.forEach((participant, index) => {
      participant.rank = rankedSubmissions.length + index + 1;
      participant.tieBreakInfo = generateTieBreakInfo(participant, 'student_no');
    });

    rankedUnsubmitted.push(...unsubmittedRanked);
  }

  // Combine and return all participants
  return [...rankedSubmissions, ...rankedUnsubmitted];
}

function generateTieBreakInfo(
  participant: RankedParticipant | UnsubmittedParticipant,
  tieBreaker: 'submission_time' | 'student_no'
): string {
  if (!participant.submittedAt) {
    return `unsubmitted, student_no: ${participant.participant.studentNo}`;
  }

  const parts = [`score: ${participant.score}`];

  if (tieBreaker === 'submission_time') {
    parts.push(`submitted: ${participant.submittedAt.toISOString()}`);
  }

  parts.push(`student_no: ${participant.participant.studentNo}`);

  return parts.join(', ');
}

/**
 * Generate a hash of the ranking for change detection
 */
export function generateRankingHash(rankedParticipants: AllParticipants[]): string {
  const rankingString = rankedParticipants
    .map(p => `${p.participant.id}:${p.rank}:${p.score}`)
    .join('|');

  // Simple hash function (for change detection, not cryptographic security)
  let hash = 0;
  for (let i = 0; i < rankingString.length; i++) {
    const char = rankingString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash).toString(36);
}

/**
 * Compare two rankings to detect significant changes
 */
export function detectRankingChanges(
  oldRanking: AllParticipants[],
  newRanking: AllParticipants[],
  threshold: number = 3
): {
  hasSignificantChange: boolean;
  changedParticipants: Array<{
    participantId: string;
    oldRank: number;
    newRank: number;
    rankChange: number;
  }>;
} {
  const oldRankMap = new Map(
    oldRanking.map(p => [p.participant.id, p.rank])
  );

  const changedParticipants: Array<{
    participantId: string;
    oldRank: number;
    newRank: number;
    rankChange: number;
  }> = [];

  for (const newP of newRanking) {
    const oldRank = oldRankMap.get(newP.participant.id);
    if (oldRank !== undefined) {
      const rankChange = Math.abs(newP.rank - oldRank);
      if (rankChange >= threshold) {
        changedParticipants.push({
          participantId: newP.participant.id,
          oldRank,
          newRank: newP.rank,
          rankChange,
        });
      }
    }
  }

  return {
    hasSignificantChange: changedParticipants.length > 0,
    changedParticipants,
  };
}