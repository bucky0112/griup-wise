const SORTING_LABELS: Record<string, string> = {
  snake_by_score: '總分',
};

// The sorting shown on the group management page comes from the run's strategy, not from config keys,
// because the create route writes `sort_by` while performGrouping writes `sort_order`.
export function sortingLabel(strategy: string): string {
  return SORTING_LABELS[strategy] ?? strategy;
}
