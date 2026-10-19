import { describe, expect, it } from 'vitest';
import { formatGroupingTime } from '../grouping-time';

describe('formatGroupingTime', () => {
  it.each([
    ['2026-10-19T04:14:45.000Z', '2026/10/19 下午12:14:45'],
    ['2026-10-19T16:00:00.000Z', '2026/10/20 上午12:00:00'],
  ])('shows %s in Taipei time as %s', (createdAt, shown) => {
    expect(formatGroupingTime(createdAt)).toBe(shown);
  });
});
