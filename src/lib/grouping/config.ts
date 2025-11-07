import { z } from 'zod';

// Standard grouping configuration schema
export const groupingConfigSchema = z.object({
  target_group_size: z.number().int().min(1).max(50),
  include_unsubmitted: z.boolean(),
  min_groups: z.number().int().min(1).optional(),
  max_groups: z.number().int().min(1).optional(),
  tie_breaker: z.enum(['submission_time', 'student_no']).default('submission_time'),
  sort_order: z.literal('desc').default('desc'), // Fixed to descending per spec
}).refine((data) => {
  // Validate min_groups <= max_groups if both specified
  if (data.min_groups && data.max_groups) {
    return data.min_groups <= data.max_groups;
  }
  return true;
}, {
  message: 'min_groups must be less than or equal to max_groups',
  path: ['min_groups'],
});

export type GroupingConfig = z.infer<typeof groupingConfigSchema>;

// Legacy configuration format for backward compatibility
export const legacyConfigSchema = z.object({
  target_group_size: z.number().int().min(1).max(50),
  include_unsubmitted: z.boolean(),
  min_groups: z.number().int().min(1).optional(),
  max_groups: z.number().int().min(1).optional(),
  sort_by: z.string().optional(), // Legacy field
});

export type LegacyConfig = z.infer<typeof legacyConfigSchema>;

// Convert legacy config to standard format
export function migrateLegacyConfig(legacy: LegacyConfig): GroupingConfig {
  return {
    target_group_size: legacy.target_group_size,
    include_unsubmitted: legacy.include_unsubmitted,
    min_groups: legacy.min_groups,
    max_groups: legacy.max_groups,
    tie_breaker: 'submission_time', // Default for legacy configs
    sort_order: 'desc',
  };
}

// Validate and normalize any config input
export function validateGroupingConfig(input: unknown): GroupingConfig {
  try {
    // First try standard format
    return groupingConfigSchema.parse(input);
  } catch (error) {
    // If that fails, try legacy format and migrate
    try {
      const legacyConfig = legacyConfigSchema.parse(input);
      return migrateLegacyConfig(legacyConfig);
    } catch (legacyError) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Invalid grouping configuration: ${errorMessage}`);
    }
  }
}

// Default configurations for common scenarios
export const defaultConfigs = {
  small: {
    target_group_size: 3,
    include_unsubmitted: false,
    tie_breaker: 'submission_time' as const,
    sort_order: 'desc' as const,
  },
  medium: {
    target_group_size: 4,
    include_unsubmitted: false,
    tie_breaker: 'submission_time' as const,
    sort_order: 'desc' as const,
  },
  large: {
    target_group_size: 5,
    include_unsubmitted: true,
    tie_breaker: 'submission_time' as const,
    sort_order: 'desc' as const,
  },
} as const;

// Helper to calculate optimal group configuration
export function calculateOptimalConfig(
  participantCount: number,
  targetGroupSize?: number
): GroupingConfig {
  const size = targetGroupSize || 4; // Default to 4 if not specified

  return {
    target_group_size: size,
    include_unsubmitted: false,
    tie_breaker: 'submission_time',
    sort_order: 'desc',
    min_groups: Math.max(1, Math.floor(participantCount / (size + 1))),
    max_groups: Math.ceil(participantCount / Math.max(1, size - 1)),
  };
}