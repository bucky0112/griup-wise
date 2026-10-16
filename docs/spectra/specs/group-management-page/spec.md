# group-management-page Specification

## Purpose

The group management page shows an admin the active grouping of a quiz, including how it was configured.

## Requirements

### Requirement: Sorting label reflects the grouping strategy

The group management page SHALL show the sorting label derived from the grouping run's `strategy`, independent of which keys the run's `config` contains.

#### Scenario: Run created by automatic grouping

- **WHEN** the active run was created by automatic grouping or the "自訂分組設定" dialog
- **THEN** the page shows "排序方式：總分"

##### Example: label by strategy

| strategy | config keys | Label |
| -------- | ----------- | ----- |
| snake_by_score | sort_by: total_score | 總分 |
| snake_by_score | sort_order: desc | 總分 |
| random | none | random |

<!-- @trace
source: fix-grouping-sort-label
updated: 2026-10-16
code:
  - src/lib/grouping/strategy-label.ts
  - src/components/admin/GroupManagement.tsx
  - src/app/admin/groups/[id]/page.tsx
  - src/app/api/admin/quizzes/[id]/groups/route.ts
  - src/lib/grouping/__unit__/strategy-label.test.ts
-->
