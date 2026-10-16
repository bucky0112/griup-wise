## 1. Default group size rule

- [x] 1.1 Per "One helper for the default group size": add `resolveDefaultGroupSize` in `src/lib/grouping/default-group-size.ts`. Write the test first in `src/lib/grouping/__unit__/default-group-size.test.ts` from the spec example table (3→3, 6→6, null→4, plus 0→4 and undefined→4). `vitest.config.ts` already includes `src/**/__unit__/**/*.test.ts`, so no config change is needed. Verify: the test fails before the helper exists and passes after, under `pnpm test`.

## 2. Create route replaces the active grouping

- [x] 2.1 Creating groups replaces the active grouping — per "Replace the active grouping in the create route": write `src/lib/grouping/__integration__/create-groups-route.test.ts` first, calling the route's exported `POST` with a mocked admin session (same pattern as `member-patch-route.test.ts`). Cover the spec's "regroup with a different size" example (4 submissions, size 2 then size 4 → 200, 1 group "第 1 組" with 4 members, one active run, previous run archived) and "Creating groups after automatic grouping" via `seedAutomaticRunWithTwoGroups`. Confirm both fail with status 500 before the fix. Then, inside the route's transaction after `lockQuizForGrouping` and before archiving, delete the active run's `group_members` and `groups`. Verify: the new tests and the full `pnpm test` pass.

## 3. Scores page form

- [x] 3.1 [after: 1.1, 2.1] Create groups from the scores page — per "Client form component for the scores page": add `CreateGroupsForm` and render it in place of the inert form in `src/app/admin/scores/[quizId]/page.tsx`, which now loads the class `targetGroupSize` via an inner join on `classes` and whether the quiz has a `grouping_runs` row with status `active`. Submitting posts to `POST /api/admin/quizzes/[id]/groups/create` with `strategy: "snake_by_score"`, navigates to `/admin/groups/[quizId]` on success, and shows the API message on failure. Verify manually in the browser: with 7 submitted participants and group size 3, 3 groups appear on the group management page; submitting a second time from the scores page also succeeds; on a quiz with no submissions the API error toast shows and inputs keep their values; the URL never gains a query string.
- [x] 3.2 [after: 3.1] When the quiz has an active grouping run, the scores-page grouping card shows "建立分組會取代目前的分組"; without one it does not. Verify manually by loading the scores page before and after creating groups.

## 4. Group management defaults

- [x] 4.1 [after: 1.1] Default group size follows the class setting on the group management page: `src/app/admin/groups/[id]/page.tsx` selects `classes.targetGroupSize` in its quiz query and passes `defaultGroupSize` to `GroupManagement`, which uses it for the "自訂分組設定" dialog's initial value, the dialog's invalid-input fallback, and the one-click "自動分組" request body and reason text. Verify manually: for a class with ideal size 3 the dialog opens with 3 and the one-click request (browser network panel) sends `target_group_size: 3`; for a class without the setting both use 4.
- [x] 4.2 [after: 3.1] The scores-page form also pre-fills the resolved class default. Verify manually: a class with ideal size 3 shows 3 in "每組人數"; a class without it shows 4.

## 5. Wrap-up

- [x] 5.1 [after: 3.2, 4.1, 4.2] Run `pnpm test`, `pnpm lint` and `pnpm build`; all three exit 0 with no new lint warnings in touched files.
- [ ] 5.2 [after: 5.1] Manual acceptance on staging after deploy, on a quiz created for the check (class ideal size 2): the scores-page form shows 2 and creates groups, a second submission replaces them, and the group management dialog and one-click both use 2. Record the result in the PR description, which closes GitHub issues #1 and #5.

## Change notes

- Former task 1.1's `vitest.config.ts` edit is dropped, not completed here: the include pattern was added by merged change `fix-auto-grouping-failure`.
- Former tasks 2.1–4.2 are renumbered 3.1–5.2; none had been started.
- Former 4.2 referenced the "Claude 測試測驗（可刪）" quiz, which was removed when staging test data was cleaned up; the check now uses a quiz created for it.
