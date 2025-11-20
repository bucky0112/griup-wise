import { describe, it, expect } from '@jest/globals';
import {
  snakeDistribution,
  validateDistribution,
  formatDistributionSummary,
  type DistributionResult,
} from '../distribution';
import type { AllParticipants } from '../ranking';
import type { GroupingConfig } from '../config';

describe('Snake Distribution', () => {
  const baseConfig: GroupingConfig = {
    target_group_size: 4,
    include_unsubmitted: false,
    tie_breaker: 'submission_time',
    sort_order: 'desc',
  };

  const createMockParticipant = (
    id: string,
    studentNo: string,
    score: number,
    rank: number
  ): AllParticipants => ({
    participant: {
      id: `participant_${id}`,
      displayName: `Student ${studentNo}`,
      studentNo,
      quizId: 'quiz_1',
    },
    score,
    rank,
    tieBreakInfo: `score: ${score}, student_no: ${studentNo}`,
    submittedAt: new Date(),
  });

  describe('snakeDistribution', () => {
    it('distributes participants in snake pattern', () => {
      // Create 8 participants with scores 100, 95, 90, 85, 80, 75, 70, 65
      const participants: AllParticipants[] = Array.from({ length: 8 }, (_, i) =>
        createMockParticipant(
          (i + 1).toString(),
          `A${(i + 1).toString().padStart(3, '0')}`,
          100 - i * 5,
          i + 1
        )
      );

      const config = { ...baseConfig, target_group_size: 4 };
      const result = snakeDistribution(participants, config);

      expect(result.groups).toHaveLength(2);

      // Group 1 should get: 1st (100), 4th (85), 5th (80), 8th (65)
      // Group 2 should get: 2nd (95), 3rd (90), 6th (75), 7th (70)
      const group1Scores = result.groups[0].participants.map(p => p.participant.score);
      const group2Scores = result.groups[1].participants.map(p => p.participant.score);

      expect(group1Scores).toEqual([100, 85, 80, 65]);
      expect(group2Scores).toEqual([95, 90, 75, 70]);
    });

    it('handles uneven distribution correctly', () => {
      // 7 participants, target group size 3 → should create 3 groups (3, 2, 2)
      const participants: AllParticipants[] = Array.from({ length: 7 }, (_, i) =>
        createMockParticipant(
          (i + 1).toString(),
          `B${(i + 1).toString().padStart(3, '0')}`,
          100 - i * 10,
          i + 1
        )
      );

      const config = { ...baseConfig, target_group_size: 3 };
      const result = snakeDistribution(participants, config);

      expect(result.groups).toHaveLength(3);

      // Verify snake pattern: 1→2→3, 3→2→1
      // Group 1: 1st, 6th
      // Group 2: 2nd, 5th, 7th
      // Group 3: 3rd, 4th
      const group1Ranks = result.groups[0].participants.map(p => p.participant.rank);
      const group2Ranks = result.groups[1].participants.map(p => p.participant.rank);
      const group3Ranks = result.groups[2].participants.map(p => p.participant.rank);

      expect(group1Ranks).toEqual([1, 6]);
      expect(group2Ranks).toEqual([2, 5, 7]);
      expect(group3Ranks).toEqual([3, 4]);
    });

    it('respects min_groups configuration', () => {
      const participants: AllParticipants[] = Array.from({ length: 6 }, (_, i) =>
        createMockParticipant(
          (i + 1).toString(),
          `C${(i + 1).toString().padStart(3, '0')}`,
          100 - i * 10,
          i + 1
        )
      );

      const config = {
        ...baseConfig,
        target_group_size: 3, // Would normally create 2 groups
        min_groups: 3,        // Force 3 groups
      };

      const result = snakeDistribution(participants, config);

      expect(result.groups).toHaveLength(3);
      expect(result.distribution.groupCount).toBe(3);
    });

    it('respects max_groups configuration', () => {
      const participants: AllParticipants[] = Array.from({ length: 12 }, (_, i) =>
        createMockParticipant(
          (i + 1).toString(),
          `D${(i + 1).toString().padStart(3, '0')}`,
          100 - i * 5,
          i + 1
        )
      );

      const config = {
        ...baseConfig,
        target_group_size: 2, // Would normally create 6 groups
        max_groups: 4,        // Limit to 4 groups
      };

      const result = snakeDistribution(participants, config);

      expect(result.groups).toHaveLength(4);
      expect(result.distribution.groupCount).toBe(4);
    });

    it('handles single participant', () => {
      const participants: AllParticipants[] = [
        createMockParticipant('1', 'E001', 100, 1),
      ];

      const result = snakeDistribution(participants, baseConfig);

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].participants).toHaveLength(1);
      expect(result.groups[0].participants[0].participant.score).toBe(100);
    });

    it('handles empty participant list', () => {
      const result = snakeDistribution([], baseConfig);

      expect(result.groups).toHaveLength(0);
      expect(result.distribution.totalParticipants).toBe(0);
      expect(result.distribution.groupCount).toBe(0);
    });

    it('assigns correct position indices within groups', () => {
      const participants: AllParticipants[] = Array.from({ length: 6 }, (_, i) =>
        createMockParticipant(
          (i + 1).toString(),
          `F${(i + 1).toString().padStart(3, '0')}`,
          100 - i * 10,
          i + 1
        )
      );

      const result = snakeDistribution(participants, baseConfig);

      // Check that position indices are sequential within each group
      for (const group of result.groups) {
        group.participants.forEach((assignment, index) => {
          expect(assignment.position).toBe(index);
        });
      }
    });

    it('assigns correct rank indices for global ordering', () => {
      const participants: AllParticipants[] = Array.from({ length: 6 }, (_, i) =>
        createMockParticipant(
          (i + 1).toString(),
          `G${(i + 1).toString().padStart(3, '0')}`,
          100 - i * 10,
          i + 1
        )
      );

      const result = snakeDistribution(participants, baseConfig);

      // Collect all rank indices from all groups
      const allRankIndices: number[] = [];
      for (const group of result.groups) {
        for (const assignment of group.participants) {
          allRankIndices.push(assignment.rankIndex);
        }
      }

      // Should have sequential rank indices from 0 to participants.length-1
      allRankIndices.sort((a, b) => a - b);
      expect(allRankIndices).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('generates correct group names', () => {
      const participants: AllParticipants[] = Array.from({ length: 4 }, (_, i) =>
        createMockParticipant(
          (i + 1).toString(),
          `H${(i + 1).toString().padStart(3, '0')}`,
          100 - i * 10,
          i + 1
        )
      );

      const result = snakeDistribution(participants, baseConfig);

      expect(result.groups[0].groupName).toBe('第 1 組');
      if (result.groups[1]) {
        expect(result.groups[1].groupName).toBe('第 2 組');
      }
    });

    it('calculates correct distribution metadata', () => {
      const participants: AllParticipants[] = Array.from({ length: 10 }, (_, i) =>
        createMockParticipant(
          (i + 1).toString(),
          `I${(i + 1).toString().padStart(3, '0')}`,
          100 - i * 5,
          i + 1
        )
      );

      const result = snakeDistribution(participants, baseConfig);

      expect(result.distribution.totalParticipants).toBe(10);
      expect(result.distribution.averageGroupSize).toBeCloseTo(10 / result.distribution.groupCount, 1);
      expect(result.distribution.strategy).toBe('snake_by_score');
      expect(result.distribution.configUsed).toEqual(baseConfig);
    });
  });

  describe('validateDistribution', () => {
    const participants: AllParticipants[] = Array.from({ length: 6 }, (_, i) =>
      createMockParticipant(
        (i + 1).toString(),
        `V${(i + 1).toString().padStart(3, '0')}`,
        100 - i * 10,
        i + 1
      )
    );

    it('validates correct distribution', () => {
      const result = snakeDistribution(participants, baseConfig);
      const validation = validateDistribution(result, participants);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('detects participant count mismatch', () => {
      const result = snakeDistribution(participants, baseConfig);

      // Remove a participant from the result to create mismatch
      result.groups[0].participants.pop();

      const validation = validateDistribution(result, participants);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(expect.stringContaining('Participant count mismatch'));
    });

    it('detects duplicate assignments', () => {
      const result = snakeDistribution(participants, baseConfig);

      // Duplicate the first participant in another group
      if (result.groups[1]) {
        result.groups[1].participants.push({...result.groups[0].participants[0]});
      }

      const validation = validateDistribution(result, participants);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(expect.stringContaining('Duplicate assignment'));
    });

    it('validates empty distribution', () => {
      const emptyResult = snakeDistribution([], baseConfig);
      const validation = validateDistribution(emptyResult, []);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('formatDistributionSummary', () => {
    it('formats distribution summary correctly', () => {
      const participants: AllParticipants[] = Array.from({ length: 4 }, (_, i) =>
        createMockParticipant(
          (i + 1).toString(),
          `S${(i + 1).toString().padStart(3, '0')}`,
          100 - i * 10,
          i + 1
        )
      );

      const result = snakeDistribution(participants, baseConfig);
      const summary = formatDistributionSummary(result);

      expect(summary).toContain('=== Distribution Summary ===');
      expect(summary).toContain('Strategy: snake_by_score');
      expect(summary).toContain('Total Participants: 4');
      expect(summary).toContain('第 1 組');
      expect(summary).toContain('Student S001');
      expect(summary).toContain('Score: 100');
    });

    it('formats empty distribution', () => {
      const emptyResult = snakeDistribution([], baseConfig);
      const summary = formatDistributionSummary(emptyResult);

      expect(summary).toContain('Total Participants: 0');
      expect(summary).toContain('Groups: 0');
    });
  });

  describe('Edge Cases', () => {
    it('handles very large group size requirement', () => {
      const participants: AllParticipants[] = Array.from({ length: 3 }, (_, i) =>
        createMockParticipant(
          (i + 1).toString(),
          `L${(i + 1).toString().padStart(3, '0')}`,
          100 - i * 10,
          i + 1
        )
      );

      const config = { ...baseConfig, target_group_size: 10 }; // Larger than participant count

      const result = snakeDistribution(participants, config);

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].participants).toHaveLength(3);
    });

    it('handles minimum possible configuration', () => {
      const participants: AllParticipants[] = [
        createMockParticipant('1', 'M001', 100, 1),
      ];

      const config = { ...baseConfig, target_group_size: 1 };

      const result = snakeDistribution(participants, config);

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].participants).toHaveLength(1);
    });

    it('prevents oversized groups: 7 participants with target_group_size 4', () => {
      // This is the specific bug case: 7 participants, target 4 per group
      // Should create 2 groups (4+3) NOT 1 group (7)
      const participants: AllParticipants[] = Array.from({ length: 7 }, (_, i) =>
        createMockParticipant(
          (i + 1).toString(),
          `X${(i + 1).toString().padStart(3, '0')}`,
          100 - i * 10,
          i + 1
        )
      );

      const config = { ...baseConfig, target_group_size: 4 };
      const result = snakeDistribution(participants, config);

      // Should create 2 groups, not 1
      expect(result.groups).toHaveLength(2);

      // Verify group sizes - should be 4 and 3 (or 3 and 4)
      const groupSizes = result.groups.map(g => g.participants.length);
      groupSizes.sort((a, b) => b - a); // Sort descending
      expect(groupSizes).toEqual([4, 3]);

      // Verify no group exceeds target_group_size + 1
      for (const group of result.groups) {
        expect(group.participants.length).toBeLessThanOrEqual(config.target_group_size + 1);
      }
    });

    it('prevents oversized groups: 9 participants with target_group_size 4', () => {
      const participants: AllParticipants[] = Array.from({ length: 9 }, (_, i) =>
        createMockParticipant(
          (i + 1).toString(),
          `Y${(i + 1).toString().padStart(3, '0')}`,
          100 - i * 5,
          i + 1
        )
      );

      const config = { ...baseConfig, target_group_size: 4 };
      const result = snakeDistribution(participants, config);

      // Should create 3 groups (3+3+3) not 2 groups (4+5)
      expect(result.groups).toHaveLength(3);

      // Verify all groups are size 3
      const groupSizes = result.groups.map(g => g.participants.length);
      expect(groupSizes).toEqual([3, 3, 3]);

      // Verify no group exceeds target_group_size + 1
      for (const group of result.groups) {
        expect(group.participants.length).toBeLessThanOrEqual(config.target_group_size + 1);
      }
    });

    it('handles edge case: 5 participants with target_group_size 4', () => {
      const participants: AllParticipants[] = Array.from({ length: 5 }, (_, i) =>
        createMockParticipant(
          (i + 1).toString(),
          `Z${(i + 1).toString().padStart(3, '0')}`,
          100 - i * 8,
          i + 1
        )
      );

      const config = { ...baseConfig, target_group_size: 4 };
      const result = snakeDistribution(participants, config);

      // Should create 1 group with 5 participants (allowed since 5 <= 4+1)
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].participants.length).toBe(5);
    });

    it('handles edge case: 6 participants with target_group_size 4', () => {
      const participants: AllParticipants[] = Array.from({ length: 6 }, (_, i) =>
        createMockParticipant(
          (i + 1).toString(),
          `W${(i + 1).toString().padStart(3, '0')}`,
          100 - i * 7,
          i + 1
        )
      );

      const config = { ...baseConfig, target_group_size: 4 };
      const result = snakeDistribution(participants, config);

      // Should create 2 groups (3+3) since 6 participants would exceed target_group_size + 1
      expect(result.groups).toHaveLength(2);

      const groupSizes = result.groups.map(g => g.participants.length);
      expect(groupSizes).toEqual([3, 3]);
    });
  });
});