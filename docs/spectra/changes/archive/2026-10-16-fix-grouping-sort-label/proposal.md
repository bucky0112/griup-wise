## Problem

The group management page shows "排序方式：其他" for every grouping created by automatic grouping or the "自訂分組設定" dialog (GitHub issue #6). Groupings from the create route show "總分". All of them sort by total score, so "其他" is wrong.

## Root Cause

`GroupManagement.tsx` derives the label from `run_info.config.sort_by === 'total_score'`. Only the create route writes `sort_by` into the run config; `performGrouping` writes `sort_order` instead. The page never loads the run's `strategy` column, which is `snake_by_score` for every run.

## Proposed Solution

- Load `grouping_runs.strategy` into `run_info` on the group management page and in `GET /api/admin/quizzes/[id]/groups`, which the page uses to reload after an edit.
- Derive the label from the strategy through a small helper: `snake_by_score` shows `總分`; an unknown strategy shows its raw value instead of a misleading "其他".

## Non-Goals (optional)

- Normalising the stored run config (`sort_by` vs `sort_order`).
- Showing tie-breaker or sort direction.

## Capabilities

- New Capabilities: `group-management-page`
- Modified Capabilities: none

## Success Criteria

- Every existing run (all `snake_by_score`) shows "排序方式：總分" regardless of how it was created.

## Impact

- Affected code:
  - Modified: src/app/admin/groups/[id]/page.tsx, src/app/api/admin/quizzes/[id]/groups/route.ts, src/components/admin/GroupManagement.tsx, vitest.config.ts
  - New: src/lib/grouping/strategy-label.ts, src/lib/grouping/__unit__/strategy-label.test.ts
  - Removed: none
