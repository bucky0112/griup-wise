## 1. Failing tests

- [x] 1.1 Add `src/lib/grouping/__integration__/grouping-freeze.test.ts` with one test per scenario added or changed in this change's auto-grouping spec: "Renamed automatic run is kept", "Automatic regroup and group rename run at the same time" (repeated 10 times with `Promise.all`), both scenarios of "Group detail edits on replaced groups are rejected", and the four scenarios of "Automatic grouping pauses while groups are visible to students" (the race scenario sets `show_group_publicly` between the early check and the lock by holding `lockQuizForGrouping` in another transaction). Use the fixtures in `src/test/grouping-fixtures.ts` (`seedAutomaticRunWithTwoGroups`, `submit`, `autoGroupAfterSubmit`, `expireCooldown`, `snapshotGrouping`) and call the route `PATCH` handler with a mocked admin session, as `member-patch-route.test.ts` does. Verify: before production changes, `pnpm test` fails the rename-kept, stale-rename (404 instead of 409), concurrent-rename and visible-groups-kept tests.

## 2. Group-details edits count as admin adjustments

- [x] 2.1 [after: 1.1] Group detail edits on replaced groups are rejected and Automatic grouping preserves admin-owned groups — per "Move group-details edits into GroupingManager" and "Unknown group ids return 409 instead of 404": add `groupingManager.updateGroupDetails`, which locks the quiz, checks the id against `activeGroupIds`, checks the `order_index` conflict, updates the group and calls `markRunAdminManaged` in one transaction; the route only validates input and maps reasons to 409 / 403 / 400. Verify: the rename-kept, stale-rename, non-owner and concurrent-rename tests (Grouping changes for a quiz are serialized) pass, the concurrent one 10/10 with no 500.

## 3. Pause while visible to students

- [x] 3.1 [after: 2.1] Automatic grouping pauses while groups are visible to students — per "Check visibility as a live condition, not a run flag": add `isAutomaticGroupingPaused` and `PUBLISHED_REASON`, use it in the early check of `autoGroup` and the locked check of `performGrouping`, add `'skipped_published'` to `SkippedStatus`, and export the reason in `src/test/grouping-fixtures.ts`. Verify: the four visibility tests pass, and all tests in `auto-grouping.test.ts`, `grouping-concurrency.test.ts` and `member-patch-route.test.ts` still pass.

## 4. Wrap-up

- [x] 4.1 [after: 3.1] Run `pnpm test` and `pnpm build`; both exit 0. `pnpm lint` adds no problems compared with the branch base.
- [ ] 4.2 [after: 4.1] Staging acceptance: on a quiz with an automatic grouping, turn on 「公開分組」, submit as a new student after the cooldown and confirm the groups on `/admin/groups/[quizId]` do not change; turn it off, submit again after the cooldown and confirm the regroup includes the new student. Rename a group through `curl -X PATCH /api/admin/groups/<id>` with the admin cookie, submit after the cooldown, and confirm the name stays. Record results in the PR and close GitHub issues #12 and #15.
