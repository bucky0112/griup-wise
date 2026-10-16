## Problem

The "建立分組" button on the scores page (`/admin/scores/[quizId]`) does nothing (GitHub issue #1). Clicking it reloads the same page with the form values in the query string (`?target_group_size=4&min_groups=1&max_groups=20`); no API request is sent and no groups are created. Reproduced locally and on the Railway staging site on 2026-10-15.

The endpoint the form should call, `POST /api/admin/quizzes/[id]/groups/create`, also fails whenever the quiz already has an active grouping: it archives the active run but keeps that run's groups, so inserting the new run's "第 1 組" violates the `groups_quiz_order_unique` constraint on `(quiz_id, order_index)` and the route returns 500 "建立分組失敗，請稍後再試". Found while verifying change `fix-auto-grouping-failure` on 2026-10-15. Today no UI calls this route, so the defect only surfaces once the scores-page form works.

Separately, every place that starts grouping pre-fills "每組人數" with a hard-coded 4 and ignores the class's "理想每組人數" setting (GitHub issue #5): the scores-page form, the "自訂分組設定" dialog and the one-click "自動分組" button on the group management page.

## Root Cause

- The scores page is a Server Component and renders a plain `<form>` with neither `action` nor `onSubmit`, so the browser performs a native GET submission back to the same URL. Nothing calls `POST /api/admin/quizzes/[id]/groups/create`.
- The create route's transaction archives active runs without deleting their groups. `GroupingManager.performGrouping` deletes the active run's members and groups before archiving, which is why automatic and dialog-based grouping do not hit the constraint.
- The scores-page form uses `defaultValue="4"`, and `GroupManagement` initialises its dialog state and its quick-group request body with the literal `4`. Neither page loads `classes.target_group_size`.

## Proposed Solution

- Replace the inert form with a client component that posts to `/api/admin/quizzes/[id]/groups/create`, shows the API's error message on failure, and navigates to `/admin/groups/[quizId]` on success. When the quiz already has an active grouping, the form states that creating groups replaces the current grouping.
- Make the create route replace an existing active grouping: inside its locked transaction, delete the active run's group members and groups before archiving the run, matching `performGrouping`.
- Load the class's `target_group_size` on the scores page and the group management page, and use it as the default group size in all three entry points, falling back to 4 when the class has none.

## Non-Goals (optional)

See design.md.

## Capabilities

- New Capabilities: `manual-grouping`
- Modified Capabilities: none

## Success Criteria

- On the scores page, submitting the form with group size 3 for a quiz with 7 submitted participants creates 3 groups and lands on `/admin/groups/[quizId]` showing them.
- Submitting the form again for the same quiz, or after automatic grouping, succeeds and leaves exactly one active run whose groups are the only groups of the quiz.
- For a class whose ideal group size is 3, the scores-page form, the "自訂分組設定" dialog and the one-click "自動分組" all use 3; for a class without the setting they use 4.
- An API rejection (for example no eligible participants) shows its message and keeps the admin on the scores page with the entered values intact.

## Impact

- Affected code:
  - Modified: src/app/admin/scores/[quizId]/page.tsx, src/app/admin/groups/[id]/page.tsx, src/components/admin/GroupManagement.tsx, src/app/api/admin/quizzes/[id]/groups/create/route.ts
  - New: src/components/admin/CreateGroupsForm.tsx, src/lib/grouping/default-group-size.ts, src/lib/grouping/__unit__/default-group-size.test.ts, src/lib/grouping/__integration__/create-groups-route.test.ts
  - Removed: none
- API behavior change: `POST /api/admin/quizzes/[id]/groups/create` returns 200 instead of 500 when the quiz has an active grouping. No request or response shape change, no database schema change.
- The Vitest setup this change relied on (from `fix-auto-grouping-failure`) is already merged; `vitest.config.ts` already includes `src/**/__unit__/**/*.test.ts` and `src/**/__integration__/**/*.test.ts`.
