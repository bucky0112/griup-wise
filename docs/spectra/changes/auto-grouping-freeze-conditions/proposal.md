## Problem

Automatic grouping replaces a quiz's active grouping run after new submissions unless the run is admin-managed. Two teacher actions do not count today, so their result is silently thrown away:

- Renaming a group, editing its notes or changing its order through `PATCH /api/admin/groups/[groupId]` does not mark the run admin-managed; the next automatic regroup rebuilds the groups and the names revert to `第 N 組` (GitHub issue #12). The same route also skips the quiz grouping lock, so an edit racing a regroup crashes with HTTP 500 instead of the 409 the member-edit routes return.
- Making groups visible to students (`show_group_publicly = true`) does not stop automatic grouping; a later submission after the cooldown reshuffles the groups students already saw (GitHub issue #15).

## Root Cause

`markRunAdminManaged` is only called from membership edits in `src/lib/grouping/manager.ts`, and the group-details route updates the `groups` row directly without `lockQuizForGrouping` or an active-run check. `autoGroup` and the locked check in `performGrouping` only ask `isActiveRunAdminManaged` and never read `quizzes.show_group_publicly`.

## Proposed Solution

- Editing a group's name, notes or order counts as an admin adjustment: the edit runs under the quiz grouping lock, checks that the group belongs to the active run, and marks an automatic run admin-managed in the same transaction. A group id that is not in the active run (including one a regroup deleted) gets HTTP 409 `分組已更新，請重新整理後再操作`, matching the member-edit routes.
- While a quiz has `show_group_publicly = true` and an active grouping run, automatic grouping is skipped with the reason `Grouping is visible to students` and grouping status `skipped_published`, both in the early check and in the locked check. Turning visibility off lets automatic grouping resume on the next qualifying submission. A quiz with no active run still gets its first automatic grouping.

## Non-Goals

- No UI change: no page calls the group-details route today, and the visibility toggle already exists.
- Publishing does not permanently mark the run admin-managed; unpublishing restores automatic updates.
- The quiz-wide `order_index` uniqueness check and admin-triggered grouping (create, regenerate, dialog) are unchanged.

## Success Criteria

- After renaming a group of an automatic run, a qualifying submission after the cooldown leaves the run, names and members unchanged and reports the admin-managed reason.
- A group-details edit using a group id replaced by a regroup returns 409 and changes nothing; no 500 under concurrent regroups.
- With groups visible to students, a qualifying submission after the cooldown leaves the active run unchanged and records `skipped_published`; after hiding them, the next qualifying submission regroups.
- `pnpm test` passes.

## Impact

- Affected specs: auto-grouping (modified "Automatic grouping preserves admin-owned groups" and "Grouping changes for a quiz are serialized"; new "Group detail edits on replaced groups are rejected" and "Automatic grouping pauses while groups are visible to students")
- Affected code:
  - Modified: src/lib/grouping/manager.ts, src/app/api/admin/groups/[groupId]/route.ts, src/test/grouping-fixtures.ts
  - New: src/lib/grouping/__integration__/grouping-freeze.test.ts
  - Removed: none
- No migration. Changing `show_group_publicly` through `PATCH /api/admin/quizzes/[id]` updates the quiz row, which waits for the `FOR NO KEY UPDATE` row lock held by a running regroup, so the regroup's locked visibility check always sees a committed value.
