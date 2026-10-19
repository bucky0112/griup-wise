## Context

Automatic grouping (`GroupingManager.autoGroup` in `src/lib/grouping/manager.ts`) skips early when `isActiveRunAdminManaged` is true, and `performGrouping` re-checks it after `lockQuizForGrouping` before writing. A run is admin-managed when its `config.trigger` is not `"automatic"`; membership edits call `markRunAdminManaged` inside their locked transaction, after checking the group ids against `activeGroupIds`. `PATCH /api/admin/groups/[groupId]` (`src/app/api/admin/groups/[groupId]/route.ts`) is outside this pattern: it reads the group, checks ownership (403 `無權限編輯此分組`), returns 404 `分組不存在` for unknown ids, and updates `groups` without a lock or active-run check. No page calls it today. `quizzes.show_group_publicly` is toggled by `PATCH /api/admin/quizzes/[id]` with a plain row update.

## Goals / Non-Goals

**Goals:**

- Group-details edits are admin adjustments, serialized with regroups, and stale ids get 409.
- Automatic grouping leaves an active run alone while students can see it, and resumes when hidden.

**Non-Goals:**

- UI changes, a permanent freeze on publish, changes to admin-triggered grouping, or the quiz-wide `order_index` uniqueness rule.

## Decisions

### Move group-details edits into GroupingManager

Add `groupingManager.updateGroupDetails(groupId, updates, adminId)` following `removeParticipant`: resolve the group's quiz, check ownership, then in one transaction `lockQuizForGrouping`, verify the id is in `activeGroupIds`, check the `order_index` conflict, update, and `markRunAdminManaged`. It returns `{ success: true, group } | { success: false, reason: 'stale_grouping' | 'forbidden' | 'order_conflict' }`. The route keeps schema validation and maps reasons to 409 `STALE_GROUPING_MESSAGE`, 403 (existing `無權限編輯此分組`), and 400 `該排序位置已被其他組別使用`. Alternative: add the lock inline in the route; rejected because every other grouping edit already lives in the manager and the member route only maps responses. A separate result type keeps `EditFailureReason` unchanged, so the member routes' exhaustive message maps are untouched.

### Unknown group ids return 409 instead of 404

A regroup deletes the groups it replaces, so a stale id and a never-existing id look the same; the member-edit routes already answer both with 409. The group-details route does the same, which replaces its 404 `分組不存在`. No caller relies on the 404.

### Check visibility as a live condition, not a run flag

Add `automaticGroupingPause(executor, quizId)` that reads the active run joined with `quizzes.show_group_publicly` and returns a `PauseStatus` (`'skipped_admin_managed' | 'skipped_published'`) or `null` (admin-managed wins). It replaces `isActiveRunAdminManaged`: `autoGroup` calls it for the early check and `performGrouping` calls it under the lock, throwing `GroupingSkippedError(pause, PAUSE_REASONS[pause])`. `SkippedStatus` becomes `PauseStatus | 'skipped_cooldown'`. Alternative: mark the run admin-managed when the quiz is published; rejected because the teacher chose "hide again to resume", which a one-way flag cannot express. Reading visibility under the quiz lock is safe because `PATCH /api/admin/quizzes/[id]` updates the quiz row and so waits for the regroup's `FOR NO KEY UPDATE` lock.

## Implementation Contract

- **Behavior**: renaming, editing notes or reordering a group of the active run returns 200 as today and makes an automatic run admin-managed; a stale or unknown id returns 409 `分組已更新，請重新整理後再操作`; a non-owner gets 403. With `show_group_publicly = true` and an active run, a qualifying submission returns `autoGrouping.triggered = false` with `Grouping is visible to students`; turning it off resumes regrouping; a quiz without a run still gets its first grouping.
- **Interface**: `GroupingManager.updateGroupDetails(groupId: string, updates: { name?: string; notes?: string; order_index?: number }, adminId: string)`; grouping event `trigger_metadata.grouping_status` may now be `"skipped_published"`; `PUBLISHED_REASON = 'Grouping is visible to students'` exported for tests and mirrored in `src/test/grouping-fixtures.ts`.
- **Failure modes**: database errors still surface as the route's existing 500 `更新分組失敗`; a skipped regroup records its event through `recordEventSafely`, so a failed event write never changes the reported outcome.
- **Acceptance**: tests in `src/lib/grouping/__integration__/grouping-freeze.test.ts` cover every scenario added or changed in this change's auto-grouping spec; the existing integration tests in `auto-grouping.test.ts`, `grouping-concurrency.test.ts` and `member-patch-route.test.ts` pass unchanged.
- **Scope**: in scope — `src/lib/grouping/manager.ts`, `src/app/api/admin/groups/[groupId]/route.ts`, `src/test/grouping-fixtures.ts`, the new test file. Out of scope — UI, `PATCH /api/admin/quizzes/[id]`, admin grouping routes, schema.

## Risks / Trade-offs

- [A teacher publishes groups early and forgets they are frozen, so late submitters stay ungrouped] → Hiding the groups resumes automatic grouping; the admin group page already lists ungrouped participants.
- [The early check now reads the quiz row as well as the active run] → One extra indexed primary-key read per submission; no ranking work is added.
