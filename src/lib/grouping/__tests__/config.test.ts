import { describe, it, expect } from '@jest/globals';
import {
  groupingConfigSchema,
  validateGroupingConfig,
  migrateLegacyConfig,
  calculateOptimalConfig,
  defaultConfigs,
  type GroupingConfig,
  type LegacyConfig,
} from '../config';

describe('GroupingConfig', () => {
  describe('groupingConfigSchema', () => {
    it('validates correct configuration', () => {
      const config = {
        target_group_size: 4,
        include_unsubmitted: false,
        tie_breaker: 'submission_time' as const,
        sort_order: 'desc' as const,
      };

      const result = groupingConfigSchema.parse(config);
      expect(result).toEqual(config);
    });

    it('applies default values for optional fields', () => {
      const config = {
        target_group_size: 4,
        include_unsubmitted: false,
      };

      const result = groupingConfigSchema.parse(config);
      expect(result).toEqual({
        target_group_size: 4,
        include_unsubmitted: false,
        tie_breaker: 'submission_time',
        sort_order: 'desc',
      });
    });

    it('validates min_groups <= max_groups constraint', () => {
      const config = {
        target_group_size: 4,
        include_unsubmitted: false,
        min_groups: 5,
        max_groups: 3,
      };

      expect(() => groupingConfigSchema.parse(config)).toThrow();
    });

    it('rejects invalid target_group_size', () => {
      const config = {
        target_group_size: 0,
        include_unsubmitted: false,
      };

      expect(() => groupingConfigSchema.parse(config)).toThrow();
    });
  });

  describe('migrateLegacyConfig', () => {
    it('migrates legacy config to standard format', () => {
      const legacyConfig: LegacyConfig = {
        target_group_size: 4,
        include_unsubmitted: true,
        sort_by: 'score_desc',
      };

      const result = migrateLegacyConfig(legacyConfig);
      expect(result).toEqual({
        target_group_size: 4,
        include_unsubmitted: true,
        tie_breaker: 'submission_time',
        sort_order: 'desc',
      });
    });

    it('preserves min/max groups from legacy config', () => {
      const legacyConfig: LegacyConfig = {
        target_group_size: 4,
        include_unsubmitted: false,
        min_groups: 2,
        max_groups: 8,
      };

      const result = migrateLegacyConfig(legacyConfig);
      expect(result.min_groups).toBe(2);
      expect(result.max_groups).toBe(8);
    });
  });

  describe('validateGroupingConfig', () => {
    it('validates standard config', () => {
      const config = {
        target_group_size: 4,
        include_unsubmitted: false,
        tie_breaker: 'submission_time',
        sort_order: 'desc',
      };

      const result = validateGroupingConfig(config);
      expect(result).toEqual(config);
    });

    it('validates and migrates legacy config', () => {
      const legacyConfig = {
        target_group_size: 4,
        include_unsubmitted: false,
        sort_by: 'score_desc',
      };

      const result = validateGroupingConfig(legacyConfig);
      expect(result.tie_breaker).toBe('submission_time');
      expect(result.sort_order).toBe('desc');
    });

    it('throws error for invalid config', () => {
      const invalidConfig = {
        target_group_size: 'invalid',
        include_unsubmitted: false,
      };

      expect(() => validateGroupingConfig(invalidConfig)).toThrow();
    });
  });

  describe('calculateOptimalConfig', () => {
    it('calculates config for small group', () => {
      const config = calculateOptimalConfig(12, 3);

      expect(config.target_group_size).toBe(3);
      expect(config.min_groups).toBeGreaterThan(0);
      expect(config.max_groups).toBeGreaterThan(config.min_groups);
    });

    it('uses default group size when not specified', () => {
      const config = calculateOptimalConfig(16);

      expect(config.target_group_size).toBe(4);
    });

    it('handles edge case with very small participant count', () => {
      const config = calculateOptimalConfig(2, 4);

      expect(config.min_groups).toBe(1);
      expect(config.max_groups).toBeGreaterThanOrEqual(1);
    });
  });

  describe('defaultConfigs', () => {
    it('provides valid default configurations', () => {
      Object.values(defaultConfigs).forEach(config => {
        expect(() => groupingConfigSchema.parse(config)).not.toThrow();
      });
    });

    it('has different group sizes for different scenarios', () => {
      expect(defaultConfigs.small.target_group_size).toBeLessThan(
        defaultConfigs.medium.target_group_size
      );
      expect(defaultConfigs.medium.target_group_size).toBeLessThan(
        defaultConfigs.large.target_group_size
      );
    });
  });
});