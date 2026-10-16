import { describe, expect, it } from 'vitest';
import { sortingLabel } from '../strategy-label';

describe('sortingLabel', () => {
  it.each([
    ['snake_by_score', '總分'],
    ['random', 'random'],
  ])('labels strategy %s as %s', (strategy, label) => {
    expect(sortingLabel(strategy)).toBe(label);
  });
});
