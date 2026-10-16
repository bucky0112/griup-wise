## Context

`src/app/admin/scores/[quizId]/page.tsx` is an async Server Component. Its "建立分組" card renders a plain `<form>` with inputs `target_group_size` (default 4), `min_groups` (1), `max_groups` (20) and checkbox `include_unsubmitted`, plus a submit button, but no `action` or `onSubmit`. The browser therefore performs a native GET to the same URL. The endpoint that should be called, `POST /api/admin/quizzes/[id]/groups/create`, already exists, checks quiz ownership, and validates `{ target_group_size: 1..50, include_unsubmitted: boolean, min_groups?, max_groups?, strategy: "snake_by_score" }`. Inside a transaction guarded by `lockQuizForGrouping` it archives any active run and creates a new one, but it does not remove the archived run's groups. Because `groups` has the unique constraint `groups_quiz_order_unique (quiz_id, order_index)`, the first group insert of the new run collides with the old run's "第 1 組" and the route returns 500. `GroupingManager.performGrouping` (`src/lib/grouping/manager.ts`) avoids this by deleting the active run's `group_members` and `groups` before archiving the run.

The group management page (`src/app/admin/groups/[id]/page.tsx`) renders the client component `GroupManagement`. Its "自訂分組設定" dialog initialises `target_group_size` to 4, and its one-click "自動分組" (`handleQuickAutoGroup`) sends a hard-coded 4. Both call `POST /api/admin/quizzes/[id]/groups/auto`, which goes through `GroupingManager.manualGroup`. Neither page reads `classes.target_group_size` (`targetGroupSize` in the Drizzle schema), although the groups page already joins `classes` when loading quiz info.

## Goals / Non-Goals

**Goals:**

- The scores-page form creates groups and lands on the group management page, including when the quiz already has a grouping.
- All three grouping entry points default to the class's ideal group size.

**Non-Goals:**

- Changing the create-groups API's request/response shape, validation, or snake distribution.
- Routing the scores-page form through `/groups/auto` instead of `/groups/create`; see "Replace the active grouping in the create route".
- Recording a `manual_trigger` grouping event from the create route; the create route has never recorded one and the cooldown rules are out of scope.
- Reading participants and submissions under the quiz lock in the create route; the route reads them before its transaction, as it does today.
- Automatic grouping after submissions (change `fix-auto-grouping-failure`, merged).
- A confirmation dialog before replacing an existing grouping; an inline notice is used instead, matching the group management page, whose "重新分組" also replaces without confirmation.
- Editing the class's ideal group size from the grouping UI.

## Decisions

### Client form component for the scores page

Extract the card's form into a new client component `CreateGroupsForm` (`src/components/admin/CreateGroupsForm.tsx`) rendered by the Server Component with props `quizId`, `defaultGroupSize` and `hasActiveGrouping`. It keeps the current fields and labels, posts JSON with `strategy: "snake_by_score"` using `fetch`, shows `toast.error(result.message)` on non-2xx, and on success calls `toast.success` then `router.push('/admin/groups/' + quizId)`. The submit button is disabled while the request is in flight.

Alternative considered: a Server Action on the existing form. Rejected because every other admin mutation in this codebase goes through `/api/admin/*` routes with client `fetch` and `sonner` toasts; a Server Action would introduce a second mutation pattern for one form.

Alternative considered: remove the form and link to the group management dialog. Rejected by the user on 2026-10-15 in favour of keeping the form usable.

### Replace the active grouping in the create route

In the create route's existing transaction, after `lockQuizForGrouping` and before archiving, select the ids of groups that belong to the quiz's active run(s), delete their `group_members` rows, then delete those `groups` rows. Archiving and inserting the new run stay as they are. This is the same order `performGrouping` uses, so every path that replaces a grouping leaves the archived run without groups, and `order_index` values start from 1 again for the new run.

Alternative considered: point the scores-page form at `/groups/auto`, which already replaces groupings correctly. Rejected because `/groups/auto` has no participant-specific error responses (its failures are "自動分組失敗" or "自動分組失敗，請稍後再試") while the create route returns the specific "沒有符合條件的參與者可以分組" / "此測驗沒有參與者，無法建立分組" messages the spec requires, and the create route would remain a broken public endpoint.

Alternative considered: change the constraint to `(grouping_run_id, order_index)`. Rejected for this change because it needs a migration and would make archived runs keep groups only on this path, diverging from `performGrouping`.

### One helper for the default group size

Add `resolveDefaultGroupSize(classTargetGroupSize: number | null | undefined): number` in `src/lib/grouping/default-group-size.ts`, returning the class value when it is a positive integer and 4 otherwise. Both pages load `classes.targetGroupSize` through their existing quiz queries (the scores page adds an inner join on `classes`) and pass the resolved value down; `GroupManagement` receives it as a `defaultGroupSize` prop used for the dialog's initial state, its invalid-input fallback, and the one-click request.

Alternative considered: resolve the default inside each component. Rejected because three copies of the fallback rule would drift.

## Implementation Contract

**Behavior**

- Scores page: submitting the grouping form creates an active run via the create-groups API and navigates to `/admin/groups/[quizId]`; failure shows the API message and leaves inputs as entered. When the quiz has an active run, the card shows the text "建立分組會取代目前的分組".
- Create route: when the quiz has an active run, the request returns 200; afterwards the quiz has exactly one active run, the previous run has status `archived`, and every `groups` row of the quiz belongs to the new run.
- Scores page, "自訂分組設定" dialog and one-click "自動分組" use `resolveDefaultGroupSize(class.targetGroupSize)`.

**Interface / data shape**

- `CreateGroupsForm` props: `{ quizId: string; defaultGroupSize: number; hasActiveGrouping: boolean }`.
- `GroupManagement` props gain `defaultGroupSize: number`.
- Request body: `{ target_group_size: number, min_groups?: number, max_groups?: number, include_unsubmitted: boolean, strategy: "snake_by_score" }`; empty min/max inputs are omitted.
- Create route response shape unchanged.

**Failure modes**

- Network error: `toast.error('建立分組失敗，請稍後再試')`, stay on page.
- Non-2xx: `toast.error(result.message)`.
- Any failure inside the create route transaction rolls back the deletion, so the previous grouping stays active.

**Acceptance criteria**

- Unit test for `resolveDefaultGroupSize` covering the spec's example table passes under `pnpm test`.
- Integration test `src/lib/grouping/__integration__/create-groups-route.test.ts` calls the route's `POST` twice for one quiz (and once after `seedAutomaticRunWithTwoGroups`) and asserts status 200, one active run, the old run archived, and only the new run's groups remaining; it fails with status 500 before the route fix.
- Manual browser check locally and on staging for every scenario in `specs/manual-grouping/spec.md`.

**Scope boundaries**

- In scope: scores page grouping card, the create route's replacement step, groups page quiz query, `GroupManagement` defaults, the new helper and tests.
- Out of scope: `/groups/auto` and `/groups/regenerate`, grouping algorithms, the database schema, other `GroupManagement` behaviour.

## Risks / Trade-offs

- [Replacing groups by accident] A working button can now overwrite an existing grouping. Mitigated by the inline notice; the archived run stays in `grouping_runs` with its config, but, as with every other regroup path, its groups are deleted.
- [No component test] The form wiring is verified manually because the project has no React testing setup; the default-size rule is unit-tested and the route replacement is integration-tested. Adding a component test harness is deferred.
