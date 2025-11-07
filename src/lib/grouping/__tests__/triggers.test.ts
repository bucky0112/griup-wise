import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  evaluateSubmissionTrigger,
  recordGroupingEvent,
  triggerManualGrouping,
  getRecentGroupingEvents,
  evaluateConfigChangeTrigger,
  defaultTriggerConfig,
  type TriggerEvaluation,
} from '../triggers';
import type { GroupingConfig } from '../config';

// Mock the database connection and modules
jest.mock('../../db', () => ({
  db: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
  },
}));

jest.mock('../ranking', () => ({
  createDeterministicRanking: jest.fn(),
  generateRankingHash: jest.fn(),
  detectRankingChanges: jest.fn(),
}));

const mockDb = require('../../db').db;
const mockRanking = require('../ranking');

describe('Grouping Triggers', () => {
  const baseConfig: GroupingConfig = {
    target_group_size: 4,
    include_unsubmitted: false,
    tie_breaker: 'submission_time',
    sort_order: 'desc',
  };

  const mockQuizId = 'quiz_123';
  const mockParticipantId = 'participant_456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('evaluateSubmissionTrigger', () => {
    it('should not trigger with insufficient participants', async () => {
      // Mock minimal submissions
      mockDb.returning.mockResolvedValueOnce([
        {
          submission: { id: '1', quizId: mockQuizId, participantId: 'p1', totalScore: 100, submittedAt: new Date() },
          participant: { id: 'p1', displayName: 'Student 1', studentNo: 'A001', quizId: mockQuizId },
        },
      ]);

      const result = await evaluateSubmissionTrigger(mockQuizId, mockParticipantId, baseConfig);

      expect(result.shouldTrigger).toBe(false);
      expect(result.reason).toContain('Not enough participants');
      expect(result.participantCount).toBe(1);
    });

    it('should not trigger during cooldown period', async () => {
      // Mock sufficient submissions
      const submissions = Array.from({ length: 5 }, (_, i) => ({
        submission: {
          id: `sub_${i}`,
          quizId: mockQuizId,
          participantId: `p_${i}`,
          totalScore: 100 - i * 10,
          submittedAt: new Date()
        },
        participant: {
          id: `p_${i}`,
          displayName: `Student ${i}`,
          studentNo: `A00${i}`,
          quizId: mockQuizId
        },
      }));

      mockDb.returning
        .mockResolvedValueOnce(submissions) // For submissions query
        .mockResolvedValueOnce([]); // For unsubmitted participants

      // Mock recent event (within cooldown)
      mockDb.returning.mockResolvedValueOnce([{
        id: 'event_1',
        quizId: mockQuizId,
        createdAt: new Date(), // Recent event
        shouldTriggerGrouping: true,
      }]);

      const result = await evaluateSubmissionTrigger(mockQuizId, mockParticipantId, baseConfig);

      expect(result.shouldTrigger).toBe(false);
      expect(result.reason).toContain('cooldown period');
      expect(result.inCooldown).toBe(true);
    });

    it('should not trigger when ranking unchanged', async () => {
      // Mock sufficient submissions
      const submissions = Array.from({ length: 5 }, (_, i) => ({
        submission: {
          id: `sub_${i}`,
          quizId: mockQuizId,
          participantId: `p_${i}`,
          totalScore: 100 - i * 10,
          submittedAt: new Date()
        },
        participant: {
          id: `p_${i}`,
          displayName: `Student ${i}`,
          studentNo: `A00${i}`,
          quizId: mockQuizId
        },
      }));

      mockDb.returning
        .mockResolvedValueOnce(submissions)
        .mockResolvedValueOnce([]); // For unsubmitted

      // Mock no recent events (no cooldown)
      mockDb.returning.mockResolvedValueOnce([]);

      // Mock same ranking hash
      const mockRankingData = [{ participant: { id: 'p1' }, score: 100, rank: 1 }];
      const sameHash = 'same_hash_123';

      mockRanking.createDeterministicRanking.mockReturnValue(mockRankingData);
      mockRanking.generateRankingHash.mockReturnValue(sameHash);

      // Mock last event with same hash
      mockDb.returning.mockResolvedValueOnce([{
        id: 'event_1',
        quizId: mockQuizId,
        newRankingHash: sameHash,
        createdAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      }]);

      const result = await evaluateSubmissionTrigger(mockQuizId, mockParticipantId, baseConfig);

      expect(result.shouldTrigger).toBe(false);
      expect(result.reason).toContain('No ranking change');
      expect(result.rankingChanged).toBe(false);
    });

    it('should trigger when all conditions are met', async () => {
      // Mock sufficient submissions
      const submissions = Array.from({ length: 5 }, (_, i) => ({
        submission: {
          id: `sub_${i}`,
          quizId: mockQuizId,
          participantId: `p_${i}`,
          totalScore: 100 - i * 10,
          submittedAt: new Date()
        },
        participant: {
          id: `p_${i}`,
          displayName: `Student ${i}`,
          studentNo: `A00${i}`,
          quizId: mockQuizId
        },
      }));

      mockDb.returning
        .mockResolvedValueOnce(submissions)
        .mockResolvedValueOnce([]); // For unsubmitted

      // Mock no recent triggering events (no cooldown)
      mockDb.returning.mockResolvedValueOnce([]);

      // Mock different ranking hash (changed ranking)
      const mockRankingData = [{ participant: { id: 'p1' }, score: 100, rank: 1 }];
      const newHash = 'new_hash_456';
      const oldHash = 'old_hash_123';

      mockRanking.createDeterministicRanking.mockReturnValue(mockRankingData);
      mockRanking.generateRankingHash.mockReturnValue(newHash);

      // Mock last event with different hash
      mockDb.returning.mockResolvedValueOnce([{
        id: 'event_1',
        quizId: mockQuizId,
        newRankingHash: oldHash,
        createdAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      }]);

      const result = await evaluateSubmissionTrigger(mockQuizId, mockParticipantId, baseConfig);

      expect(result.shouldTrigger).toBe(true);
      expect(result.reason).toContain('Ranking changed significantly');
      expect(result.rankingChanged).toBe(true);
      expect(result.inCooldown).toBe(false);
      expect(result.participantCount).toBe(5);
    });

    it('should include unsubmitted participants when configured', async () => {
      const configWithUnsubmitted = { ...baseConfig, include_unsubmitted: true };

      // Mock 3 submissions
      const submissions = Array.from({ length: 3 }, (_, i) => ({
        submission: {
          id: `sub_${i}`,
          quizId: mockQuizId,
          participantId: `p_${i}`,
          totalScore: 100 - i * 10,
          submittedAt: new Date()
        },
        participant: {
          id: `p_${i}`,
          displayName: `Student ${i}`,
          studentNo: `A00${i}`,
          quizId: mockQuizId
        },
      }));

      // Mock all participants (5 total)
      const allParticipants = Array.from({ length: 5 }, (_, i) => ({
        id: `p_${i}`,
        displayName: `Student ${i}`,
        studentNo: `A00${i}`,
        quizId: mockQuizId,
      }));

      mockDb.returning
        .mockResolvedValueOnce(submissions)
        .mockResolvedValueOnce(allParticipants); // All participants for unsubmitted calculation

      // Mock no cooldown
      mockDb.returning.mockResolvedValueOnce([]);

      // Mock ranking change
      mockRanking.createDeterministicRanking.mockReturnValue([]);
      mockRanking.generateRankingHash.mockReturnValue('new_hash');

      mockDb.returning.mockResolvedValueOnce([{
        newRankingHash: 'old_hash',
        createdAt: new Date(Date.now() - 10 * 60 * 1000),
      }]);

      const result = await evaluateSubmissionTrigger(
        mockQuizId,
        mockParticipantId,
        configWithUnsubmitted
      );

      // Should count 5 total participants (3 submitted + 2 unsubmitted)
      expect(result.participantCount).toBe(5);
      expect(mockRanking.createDeterministicRanking).toHaveBeenCalledWith(
        submissions,
        expect.arrayContaining([
          expect.objectContaining({ id: 'p_3' }),
          expect.objectContaining({ id: 'p_4' }),
        ]),
        configWithUnsubmitted
      );
    });
  });

  describe('recordGroupingEvent', () => {
    it('should record event with correct data', async () => {
      const mockEvaluation: TriggerEvaluation = {
        shouldTrigger: true,
        reason: 'Test trigger',
        eventType: 'submission',
        participantCount: 5,
        rankingChanged: true,
        inCooldown: false,
      };

      const mockEventId = 'event_123';
      mockDb.returning.mockResolvedValueOnce([{ id: mockEventId }]);

      const result = await recordGroupingEvent(
        mockQuizId,
        mockEvaluation,
        mockParticipantId,
        'old_hash',
        'new_hash',
        { customData: 'test' }
      );

      expect(result).toBe(mockEventId);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith({
        quizId: mockQuizId,
        eventType: 'submission',
        participantId: mockParticipantId,
        oldRankingHash: 'old_hash',
        newRankingHash: 'new_hash',
        shouldTriggerGrouping: true,
        triggerMetadata: {
          reason: 'Test trigger',
          participantCount: 5,
          rankingChanged: true,
          inCooldown: false,
          customData: 'test',
        },
      });
    });
  });

  describe('triggerManualGrouping', () => {
    it('should always return trigger-enabled evaluation', async () => {
      const adminId = 'admin_123';
      const reason = 'Manual intervention needed';

      mockDb.returning.mockResolvedValueOnce([{ id: 'event_456' }]);

      const result = await triggerManualGrouping(mockQuizId, adminId, reason);

      expect(result.shouldTrigger).toBe(true);
      expect(result.reason).toBe(reason);
      expect(result.eventType).toBe('manual_trigger');
    });
  });

  describe('evaluateConfigChangeTrigger', () => {
    it('should trigger config change when not in cooldown', async () => {
      const newConfig = { ...baseConfig, target_group_size: 6 };

      // Mock no recent events (no cooldown)
      mockDb.returning.mockResolvedValueOnce([]);

      const result = await evaluateConfigChangeTrigger(mockQuizId, newConfig, baseConfig);

      expect(result.shouldTrigger).toBe(true);
      expect(result.reason).toContain('configuration changed');
      expect(result.eventType).toBe('config_change');
    });

    it('should not trigger config change during cooldown', async () => {
      const newConfig = { ...baseConfig, target_group_size: 6 };

      // Mock recent event (in cooldown)
      mockDb.returning.mockResolvedValueOnce([{
        createdAt: new Date(),
        shouldTriggerGrouping: true,
      }]);

      const result = await evaluateConfigChangeTrigger(mockQuizId, newConfig, baseConfig);

      expect(result.shouldTrigger).toBe(false);
      expect(result.reason).toContain('cooldown period');
      expect(result.inCooldown).toBe(true);
    });
  });

  describe('getRecentGroupingEvents', () => {
    it('should fetch recent events with correct query', async () => {
      const mockEvents = [
        { id: 'event_1', eventType: 'submission', createdAt: new Date() },
        { id: 'event_2', eventType: 'manual_trigger', createdAt: new Date() },
      ];

      mockDb.returning.mockResolvedValueOnce(mockEvents);

      const result = await getRecentGroupingEvents(mockQuizId, 5);

      expect(result).toEqual(mockEvents);
      expect(mockDb.limit).toHaveBeenCalledWith(5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty submissions list', async () => {
      mockDb.returning.mockResolvedValueOnce([]); // No submissions

      const result = await evaluateSubmissionTrigger(mockQuizId, mockParticipantId, baseConfig);

      expect(result.shouldTrigger).toBe(false);
      expect(result.participantCount).toBe(0);
    });

    it('should handle first submission (no previous events)', async () => {
      // Mock sufficient submissions
      const submissions = Array.from({ length: 4 }, (_, i) => ({
        submission: {
          id: `sub_${i}`,
          quizId: mockQuizId,
          participantId: `p_${i}`,
          totalScore: 100 - i * 10,
          submittedAt: new Date()
        },
        participant: {
          id: `p_${i}`,
          displayName: `Student ${i}`,
          studentNo: `A00${i}`,
          quizId: mockQuizId
        },
      }));

      mockDb.returning
        .mockResolvedValueOnce(submissions)
        .mockResolvedValueOnce([]) // No unsubmitted
        .mockResolvedValueOnce([]) // No recent events (no cooldown)
        .mockResolvedValueOnce([]); // No previous events

      mockRanking.createDeterministicRanking.mockReturnValue([]);
      mockRanking.generateRankingHash.mockReturnValue('first_hash');

      const result = await evaluateSubmissionTrigger(mockQuizId, mockParticipantId, baseConfig);

      expect(result.shouldTrigger).toBe(true);
      expect(result.reason).toContain('Ranking changed significantly');
    });
  });
});