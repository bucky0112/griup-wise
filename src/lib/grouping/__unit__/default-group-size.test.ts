import { describe, it, expect } from 'vitest';
import { resolveDefaultGroupSize } from '../default-group-size';

describe('resolveDefaultGroupSize', () => {
  it.each([
    [3, 3],
    [6, 6],
    [null, 4],
    [undefined, 4],
    [0, 4],
  ])('class target_group_size %s resolves to %s', (classSize, expected) => {
    expect(resolveDefaultGroupSize(classSize)).toBe(expected);
  });
});
