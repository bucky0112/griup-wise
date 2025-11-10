import type { AllParticipants } from './ranking';
import type { GroupingConfig } from './config';

// Result of snake distribution
export interface DistributionResult {
  groups: GroupAssignment[];
  distribution: DistributionMetadata;
}

export interface GroupAssignment {
  groupIndex: number;
  groupName: string;
  participants: ParticipantAssignment[];
}

export interface ParticipantAssignment {
  participant: AllParticipants;
  position: number; // Position within the group (0-based)
  rankIndex: number; // Global assignment order for tie-breaking
}

export interface DistributionMetadata {
  totalParticipants: number;
  groupCount: number;
  averageGroupSize: number;
  minGroupSize: number;
  maxGroupSize: number;
  strategy: 'snake_by_score';
  configUsed: GroupingConfig;
}

/**
 * Perform snake (serpentine) distribution of ranked participants
 *
 * Algorithm:
 * 1. Take ranked participants (highest score first)
 * 2. Distribute in snake pattern:
 *    - Round 1: Group 1 → 2 → 3 → ... → N
 *    - Round 2: Group N → N-1 → ... → 2 → 1
 *    - Round 3: Group 1 → 2 → 3 → ... → N
 *    - Continue until all participants assigned
 *
 * This ensures high-scoring participants are evenly distributed across groups
 */
export function snakeDistribution(
  rankedParticipants: AllParticipants[],
  config: GroupingConfig
): DistributionResult {
  if (rankedParticipants.length === 0) {
    return {
      groups: [],
      distribution: {
        totalParticipants: 0,
        groupCount: 0,
        averageGroupSize: 0,
        minGroupSize: 0,
        maxGroupSize: 0,
        strategy: 'snake_by_score',
        configUsed: config,
      },
    };
  }

  // Calculate optimal grouping
  const { groupCount, groupSizes } = calculateOptimalGrouping(rankedParticipants.length, config);

  // Initialize groups
  const groups: ParticipantAssignment[][] = Array(groupCount)
    .fill(null)
    .map(() => []);

  // Simple round-robin distribution that respects optimal group sizes
  // This ensures groups match the predetermined sizes exactly
  let participantIndex = 0;

  // Fill groups in rounds, respecting their target sizes
  let round = 0;
  while (participantIndex < rankedParticipants.length) {
    // Determine direction for this round (snake pattern)
    const isForward = round % 2 === 0;
    const groupOrder = isForward
      ? Array.from({ length: groupCount }, (_, i) => i)
      : Array.from({ length: groupCount }, (_, i) => groupCount - 1 - i);

    // Assign one participant to each group that still has capacity
    for (const groupIndex of groupOrder) {
      if (participantIndex >= rankedParticipants.length) break;
      if (groups[groupIndex].length < groupSizes[groupIndex]) {
        const participant = rankedParticipants[participantIndex];
        groups[groupIndex].push({
          participant,
          position: groups[groupIndex].length,
          rankIndex: participantIndex,
        });
        participantIndex++;
      }
    }
    round++;
  }

  // Convert to final format with group names
  const groupAssignments: GroupAssignment[] = groups.map((group, index) => ({
    groupIndex: index,
    groupName: `第 ${index + 1} 組`,
    participants: group,
  }));

  // Calculate distribution metadata
  const actualGroupSizes = groups.map(g => g.length);
  const distribution: DistributionMetadata = {
    totalParticipants: rankedParticipants.length,
    groupCount,
    averageGroupSize: rankedParticipants.length / groupCount,
    minGroupSize: Math.min(...actualGroupSizes),
    maxGroupSize: Math.max(...actualGroupSizes),
    strategy: 'snake_by_score',
    configUsed: config,
  };

  return {
    groups: groupAssignments,
    distribution,
  };
}

/**
 * Calculate optimal number of groups and their sizes based on configuration
 */
function calculateOptimalGrouping(participantCount: number, config: GroupingConfig): {
  groupCount: number;
  groupSizes: number[];
} {
  if (participantCount === 0) {
    return { groupCount: 0, groupSizes: [] };
  }

  const candidates = [];

  // Test different group counts within reasonable range
  const minGroups = config.min_groups || 1;
  const maxGroups = config.max_groups || Math.ceil(participantCount / 2); // Reasonable upper limit

  for (let groups = minGroups; groups <= maxGroups; groups++) {
    const baseSize = Math.floor(participantCount / groups);
    const remainder = participantCount % groups;

    // Calculate distribution - larger groups first
    const groupSizes = Array(groups).fill(baseSize);
    for (let i = 0; i < remainder; i++) {
      groupSizes[i]++;
    }

    // Calculate deviations from target
    const deviations = groupSizes.map(size => Math.abs(size - config.target_group_size));
    const maxDeviation = Math.max(...deviations);
    const avgDeviation = deviations.reduce((sum, dev) => sum + dev, 0) / groups;

    // Score: prefer smaller max deviation, then smaller average deviation
    const score = maxDeviation * 10 + avgDeviation;

    candidates.push({
      groupCount: groups,
      groupSizes,
      maxDeviation,
      avgDeviation,
      score
    });
  }

  // If no constraints specified, add the simple ceil calculation
  if (!config.min_groups && !config.max_groups) {
    const simpleGroups = Math.ceil(participantCount / config.target_group_size);
    const baseSize = Math.floor(participantCount / simpleGroups);
    const remainder = participantCount % simpleGroups;

    const groupSizes = Array(simpleGroups).fill(baseSize);
    for (let i = 0; i < remainder; i++) {
      groupSizes[i]++;
    }

    const deviations = groupSizes.map(size => Math.abs(size - config.target_group_size));
    const maxDeviation = Math.max(...deviations);
    const avgDeviation = deviations.reduce((sum, dev) => sum + dev, 0) / simpleGroups;
    const score = maxDeviation * 10 + avgDeviation;

    candidates.push({
      groupCount: simpleGroups,
      groupSizes,
      maxDeviation,
      avgDeviation,
      score
    });
  }

  // Find best candidate (lowest score)
  candidates.sort((a, b) => a.score - b.score);
  const best = candidates[0];

  return {
    groupCount: best.groupCount,
    groupSizes: best.groupSizes
  };
}

/**
 * Validate distribution result for correctness
 */
export function validateDistribution(
  result: DistributionResult,
  originalParticipants: AllParticipants[]
): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check participant count matches
  const totalAssigned = result.groups.reduce((sum, group) => sum + group.participants.length, 0);
  if (totalAssigned !== originalParticipants.length) {
    errors.push(`Participant count mismatch: assigned ${totalAssigned}, expected ${originalParticipants.length}`);
  }

  // Check for duplicate assignments
  const assignedIds = new Set<string>();
  for (const group of result.groups) {
    for (const assignment of group.participants) {
      const id = assignment.participant.participant.id;
      if (assignedIds.has(id)) {
        errors.push(`Duplicate assignment for participant ${id}`);
      }
      assignedIds.add(id);
    }
  }

  // Check for missing participants
  const originalIds = new Set(originalParticipants.map(p => p.participant.id));
  const assignedIdArray = Array.from(assignedIds);
  for (const id of assignedIdArray) {
    if (!originalIds.has(id)) {
      errors.push(`Unknown participant ${id} in assignment`);
    }
  }

  // Check rank index ordering within groups
  for (const group of result.groups) {
    const rankIndices = group.participants.map(p => p.rankIndex);
    if (!isSnakePatternValid(rankIndices, result.distribution.groupCount, group.groupIndex)) {
      errors.push(`Invalid snake pattern in group ${group.groupIndex + 1}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Verify that rank indices in a group follow the snake pattern
 */
function isSnakePatternValid(rankIndices: number[], totalGroups: number, groupIndex: number): boolean {
  if (rankIndices.length === 0) return true;

  // Sort indices to check the pattern
  const sortedIndices = [...rankIndices].sort((a, b) => a - b);

  for (let i = 0; i < sortedIndices.length; i++) {
    const expectedRankIndex = calculateExpectedRankIndex(groupIndex, i, totalGroups);
    if (sortedIndices[i] !== expectedRankIndex) {
      return false;
    }
  }

  return true;
}

/**
 * Calculate expected rank index for a position in snake distribution
 */
function calculateExpectedRankIndex(groupIndex: number, position: number, totalGroups: number): number {
  let currentIndex = groupIndex;

  for (let round = 0; round < position; round++) {
    currentIndex += totalGroups;

    // Adjust for snake pattern direction changes
    if (Math.floor(currentIndex / totalGroups) % 2 === 1) {
      // Odd round - reverse direction
      const roundStart = Math.floor(currentIndex / totalGroups) * totalGroups;
      currentIndex = roundStart + (totalGroups - 1 - (currentIndex % totalGroups));
    }
  }

  return currentIndex;
}

/**
 * Create a textual representation of the distribution for debugging
 */
export function formatDistributionSummary(result: DistributionResult): string {
  const lines: string[] = [];

  lines.push(`=== Distribution Summary ===`);
  lines.push(`Strategy: ${result.distribution.strategy}`);
  lines.push(`Total Participants: ${result.distribution.totalParticipants}`);
  lines.push(`Groups: ${result.distribution.groupCount}`);
  lines.push(`Average Group Size: ${result.distribution.averageGroupSize.toFixed(1)}`);
  lines.push(`Size Range: ${result.distribution.minGroupSize} - ${result.distribution.maxGroupSize}`);
  lines.push('');

  for (const group of result.groups) {
    lines.push(`${group.groupName} (${group.participants.length} members):`);
    for (const assignment of group.participants) {
      const p = assignment.participant;
      lines.push(`  ${assignment.position + 1}. ${p.participant.displayName} (${p.participant.studentNo}) - Score: ${p.score}, Rank: ${p.rank}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}