import { describe, it, expect } from 'vitest';
import {
  createDeterministicRanking,
  generateRankingHash,
  detectRankingChanges,
  type SubmissionWithParticipant,
  type AllParticipants,
} from '../ranking';
import type { GroupingConfig } from '../config';

describe('Ranking System', () => {
  const baseConfig: GroupingConfig = {
    target_group_size: 4,
    include_unsubmitted: false,
    tie_breaker: 'submission_time',
    sort_order: 'desc',
  };

  const createMockSubmission = (
    id: string,
    studentNo: string,
    score: number,
    submittedAt: Date,
    displayName = `Student ${studentNo}`
  ): SubmissionWithParticipant => ({
    submission: {
      id: `sub_${id}`,
      quizId: 'quiz_1',
      participantId: `participant_${id}`,
      totalScore: score,
      submittedAt,
    },
    participant: {
      id: `participant_${id}`,
      displayName,
      studentNo,
      quizId: 'quiz_1',
    },
  });

  const createMockParticipant = (id: string, studentNo: string, displayName = `Student ${studentNo}`) => ({
    id: `participant_${id}`,
    displayName,
    studentNo,
    quizId: 'quiz_1',
  });

  describe('createDeterministicRanking', () => {
    it('ranks participants by score in descending order', () => {
      const submissions = [
        createMockSubmission('1', 'A001', 85, new Date('2024-01-01T10:00:00Z')),
        createMockSubmission('2', 'A002', 92, new Date('2024-01-01T10:01:00Z')),
        createMockSubmission('3', 'A003', 78, new Date('2024-01-01T10:02:00Z')),
      ];

      const ranking = createDeterministicRanking(submissions, [], baseConfig);

      expect(ranking).toHaveLength(3);
      expect(ranking[0].score).toBe(92); // A002
      expect(ranking[1].score).toBe(85); // A001
      expect(ranking[2].score).toBe(78); // A003
      expect(ranking[0].rank).toBe(1);
      expect(ranking[1].rank).toBe(2);
      expect(ranking[2].rank).toBe(3);
    });

    it('handles ties with submission_time tie-breaker', () => {
      const config = { ...baseConfig, tie_breaker: 'submission_time' as const };
      const submissions = [
        createMockSubmission('1', 'B002', 85, new Date('2024-01-01T10:01:00Z')),
        createMockSubmission('2', 'B001', 85, new Date('2024-01-01T10:00:00Z')), // Earlier
        createMockSubmission('3', 'B003', 85, new Date('2024-01-01T10:02:00Z')),
      ];

      const ranking = createDeterministicRanking(submissions, [], config);

      expect(ranking[0].participant.studentNo).toBe('B001'); // Earliest submission
      expect(ranking[1].participant.studentNo).toBe('B002');
      expect(ranking[2].participant.studentNo).toBe('B003');
    });

    it('handles ties with student_no tie-breaker', () => {
      const config = { ...baseConfig, tie_breaker: 'student_no' as const };
      const submissions = [
        createMockSubmission('1', 'C003', 85, new Date('2024-01-01T10:00:00Z')),
        createMockSubmission('2', 'C001', 85, new Date('2024-01-01T10:01:00Z')),
        createMockSubmission('3', 'C002', 85, new Date('2024-01-01T10:02:00Z')),
      ];

      const ranking = createDeterministicRanking(submissions, [], config);

      expect(ranking[0].participant.studentNo).toBe('C001');
      expect(ranking[1].participant.studentNo).toBe('C002');
      expect(ranking[2].participant.studentNo).toBe('C003');
    });

    it('applies final student_no tie-breaker consistently', () => {
      // Even with submission_time tie-breaker, student_no should be final arbiter
      const config = { ...baseConfig, tie_breaker: 'submission_time' as const };
      const sameTime = new Date('2024-01-01T10:00:00Z');
      const submissions = [
        createMockSubmission('1', 'D003', 85, sameTime),
        createMockSubmission('2', 'D001', 85, sameTime),
        createMockSubmission('3', 'D002', 85, sameTime),
      ];

      const ranking = createDeterministicRanking(submissions, [], config);

      expect(ranking[0].participant.studentNo).toBe('D001');
      expect(ranking[1].participant.studentNo).toBe('D002');
      expect(ranking[2].participant.studentNo).toBe('D003');
    });

    it('includes unsubmitted participants when configured', () => {
      const config = { ...baseConfig, include_unsubmitted: true };
      const submissions = [
        createMockSubmission('1', 'E001', 85, new Date('2024-01-01T10:00:00Z')),
        createMockSubmission('2', 'E002', 92, new Date('2024-01-01T10:01:00Z')),
      ];
      const unsubmitted = [
        createMockParticipant('3', 'E003'),
        createMockParticipant('4', 'E000'), // Should come first alphabetically
      ];

      const ranking = createDeterministicRanking(submissions, unsubmitted, config);

      expect(ranking).toHaveLength(4);
      expect(ranking[0].score).toBe(92); // E002
      expect(ranking[1].score).toBe(85); // E001
      expect(ranking[2].score).toBe(0);  // E000 (unsubmitted, alphabetically first)
      expect(ranking[3].score).toBe(0);  // E003 (unsubmitted)
      expect(ranking[2].participant.studentNo).toBe('E000');
      expect(ranking[3].participant.studentNo).toBe('E003');
    });

    it('excludes unsubmitted participants by default', () => {
      const submissions = [
        createMockSubmission('1', 'F001', 85, new Date('2024-01-01T10:00:00Z')),
      ];
      const unsubmitted = [
        createMockParticipant('2', 'F002'),
      ];

      const ranking = createDeterministicRanking(submissions, unsubmitted, baseConfig);

      expect(ranking).toHaveLength(1);
      expect(ranking[0].participant.studentNo).toBe('F001');
    });

    it('generates correct tie-break info', () => {
      const submissions = [
        createMockSubmission('1', 'G001', 85, new Date('2024-01-01T10:00:00Z')),
      ];

      const ranking = createDeterministicRanking(submissions, [], baseConfig);

      expect(ranking[0].tieBreakInfo).toContain('score: 85');
      expect(ranking[0].tieBreakInfo).toContain('submitted: 2024-01-01T10:00:00.000Z');
      expect(ranking[0].tieBreakInfo).toContain('student_no: G001');
    });

    it('handles empty submissions list', () => {
      const ranking = createDeterministicRanking([], [], baseConfig);
      expect(ranking).toHaveLength(0);
    });
  });

  describe('generateRankingHash', () => {
    it('generates consistent hash for same ranking', () => {
      const ranking1: AllParticipants[] = [
        {
          participant: createMockParticipant('1', 'A001'),
          score: 85,
          rank: 1,
          tieBreakInfo: 'test',
          submittedAt: new Date(),
        },
      ];

      const ranking2: AllParticipants[] = [
        {
          participant: createMockParticipant('1', 'A001'),
          score: 85,
          rank: 1,
          tieBreakInfo: 'different info', // Should not affect hash
          submittedAt: new Date(), // Should not affect hash
        },
      ];

      const hash1 = generateRankingHash(ranking1);
      const hash2 = generateRankingHash(ranking2);

      expect(hash1).toBe(hash2);
    });

    it('generates different hash for different rankings', () => {
      const ranking1: AllParticipants[] = [
        {
          participant: createMockParticipant('1', 'A001'),
          score: 85,
          rank: 1,
          tieBreakInfo: 'test',
          submittedAt: new Date(),
        },
      ];

      const ranking2: AllParticipants[] = [
        {
          participant: createMockParticipant('1', 'A001'),
          score: 90, // Different score
          rank: 1,
          tieBreakInfo: 'test',
          submittedAt: new Date(),
        },
      ];

      const hash1 = generateRankingHash(ranking1);
      const hash2 = generateRankingHash(ranking2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('detectRankingChanges', () => {
    const createRankingItem = (id: string, rank: number, score: number): AllParticipants => ({
      participant: createMockParticipant(id, `A${id.padStart(3, '0')}`),
      score,
      rank,
      tieBreakInfo: 'test',
      submittedAt: new Date(),
    });

    it('detects significant rank changes', () => {
      const oldRanking = [
        createRankingItem('1', 1, 90),
        createRankingItem('2', 2, 85),
        createRankingItem('3', 3, 80),
      ];

      const newRanking = [
        createRankingItem('2', 1, 95), // Moved from rank 2 to 1
        createRankingItem('1', 2, 90), // Moved from rank 1 to 2
        createRankingItem('3', 5, 75), // Moved from rank 3 to 5 (significant)
      ];

      const result = detectRankingChanges(oldRanking, newRanking, 2);

      expect(result.hasSignificantChange).toBe(true);
      expect(result.changedParticipants).toHaveLength(1);
      expect(result.changedParticipants[0].participantId).toBe('participant_3');
      expect(result.changedParticipants[0].rankChange).toBe(2);
    });

    it('does not detect minor rank changes below threshold', () => {
      const oldRanking = [
        createRankingItem('1', 1, 90),
        createRankingItem('2', 2, 85),
      ];

      const newRanking = [
        createRankingItem('2', 1, 87),
        createRankingItem('1', 2, 90),
      ];

      const result = detectRankingChanges(oldRanking, newRanking, 3);

      expect(result.hasSignificantChange).toBe(false);
      expect(result.changedParticipants).toHaveLength(0);
    });

    it('handles new participants gracefully', () => {
      const oldRanking = [
        createRankingItem('1', 1, 90),
      ];

      const newRanking = [
        createRankingItem('1', 1, 90),
        createRankingItem('2', 2, 85), // New participant
      ];

      const result = detectRankingChanges(oldRanking, newRanking, 2);

      expect(result.hasSignificantChange).toBe(false); // New participants don't count as changes
      expect(result.changedParticipants).toHaveLength(0);
    });
  });
});