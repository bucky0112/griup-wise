## Context

Student submissions call `groupingManager.autoGroup` from the submit route (`src/app/api/assignments/submit/route.ts`) after the submission transaction commits. `autoGroup` evaluates the trigger (`evaluateSubmissionTrigger` in `src/lib/grouping/triggers.ts`), records a `grouping_events` row, then calls the private `performGrouping`, which deletes the quiz's active groups, archives active runs and inserts a new `grouping_runs` row inside one transaction.

Two defects make automatic grouping fail on every attempt and block retries:

- `autoGroup` passes the literal `'system'` as `createdBy`; `grouping_runs.created_by` is a `uuid` foreign key to `admins.id`, so the insert fails and the transaction rolls back.
- The event with `should_trigger_grouping = true` is recorded before the attempt; `isInCooldownPeriod` counts any such event in the last 5 minutes, so a failed attempt starts the cooldown.

Because automatic grouping has never succeeded, its replace-everything behaviour has never run in production. Fixing the defect alone would let later submissions overwrite groups an admin created through `/api/admin/quizzes/[id]/groups/create`, `/groups/auto` (`manualGroup`), or `/groups/regenerate`, and membership edits made through `moveParticipant`, `swapParticipants`, `batchMove` and the `PATCH /api/admin/groups/[groupId]/members` route. The user decided on 2026-10-15 that automatic grouping must leave such groups alone.

The project has no runnable test runner: tests in `src/lib/grouping/__tests__/` import `@jest/globals`, but Jest is not installed and `package.json` has no `test` script. A local PostgreSQL instance is available for development.

## Goals / Non-Goals

**Goals:**

- Automatic grouping succeeds and attributes the run to the quiz owner.
- A failed attempt never starts the cooldown.
- Automatic grouping never replaces a run created or adjusted by an admin.
- A `pnpm test` command exists and runs integration tests against a real PostgreSQL test database.

**Non-Goals:**

- Using the class `target_group_size` for automatic grouping; it keeps `defaultConfigs.medium` (4 per group). Tracked separately with GitHub issue #5.
- Migrating or reviving the existing Jest-based tests in `src/lib/grouping/__tests__/`; they stay untouched and are excluded from the Vitest run.
- A database migration to make `grouping_runs.created_by` nullable (rejected, see Decisions).
- Changing the trigger threshold (3 participants), the cooldown length (5 minutes), or the ranking-change detection.
- A UI indicator showing whether the active grouping is automatic or admin-managed.

## Decisions

### Attribute automatic runs to the quiz owner

`autoGroup` reads `quizzes.created_by` for the quiz and passes it to `performGrouping`. The run config gains `trigger: "automatic"`.

Alternative considered: make `created_by` nullable and treat null as "system". Rejected by the user because it needs a migration and every reader that inner-joins `admins` (for example the grouping-runs listing) would have to switch to a left join.

### Mark admin ownership in the run config

A run is admin-managed when `config.trigger` is anything other than `"automatic"`, including absent. This classifies every existing run (none of which carry `trigger`) as admin-managed without a data migration. Membership edits on an automatic run set `config.trigger` to `"manual_adjusted"` in the same transaction as the edit, through one shared helper `markRunAdminManaged(tx, groupId)` that resolves the group's run and updates its config.

The admin-managed check runs inside the regroup transaction and reads the active run with `SELECT ... FOR UPDATE`. `markRunAdminManaged` updates that same row inside the edit's transaction, so an edit and an automatic regroup serialize: an edit that commits first makes the regroup skip, and an edit that arrives during the regroup waits and then fails because its groups were replaced, rather than being silently overwritten. A check before the transaction was rejected after review on 2026-10-15 because an edit could commit between the check and the regroup.

Alternative considered: a new boolean column `admin_managed`. Rejected because it needs a migration while the jsonb config already carries per-run metadata.

### Record the trigger event after the attempt

`autoGroup` evaluates the trigger, attempts grouping only when `shouldTrigger` is true and the active run is not admin-managed, and then records one event whose `trigger_metadata.grouping_status` is `"succeeded"`, `"failed"`, or `"skipped_admin_managed"`. `isInCooldownPeriod` only counts events with `should_trigger_grouping = true` whose `grouping_status` is not `"failed"` or `"skipped_admin_managed"`. When the attempt throws, `autoGroup` records the failed event and rethrows so the submit route keeps its existing `autoGrouping.error` response.

Alternative considered: base the cooldown on the newest `grouping_runs.created_at`. Rejected because a manual admin run would then also suppress automatic grouping, which changes semantics beyond this fix.

### Vitest with a dedicated test database

Add `vitest` as a dev dependency and a `test` script (`vitest run`). `vitest.config.ts` includes only `src/**/__integration__/**/*.test.ts`, so the dormant Jest tests are not collected. A global setup reads `TEST_DATABASE_URL` (default `postgresql://localhost:5432/group_wise_test`), refuses to run when that URL equals `DATABASE_URL` from `.env.local`, sets `process.env.DATABASE_URL` to it before `src/lib/db` initializes, and applies the migrations in `src/lib/db/migrations` with drizzle's node-postgres migrator. Each test truncates the tables it uses.

Alternative considered: mock the database as the existing tests do. Rejected because the defect only appears when PostgreSQL enforces the foreign key.

## Implementation Contract

**Behavior**

- A qualifying submission on a quiz without an admin-managed active run creates an automatic run (`created_by` = quiz owner, `config.trigger = "automatic"`) and the submit response reports `autoGrouping.triggered = true`.
- A qualifying submission on a quiz whose active run is admin-managed leaves runs, groups and members unchanged; the response reports `autoGrouping.triggered = false` with reason `Active grouping is admin-managed`.
- A failed attempt records `grouping_status: "failed"`; the next qualifying submission attempts again.

**Interface / data shape**

- `grouping_runs.config.trigger`: `"automatic"` | `"manual_adjusted"` | absent (admin-created).
- `grouping_events.trigger_metadata.grouping_status`: `"succeeded"` | `"failed"` | `"skipped_admin_managed"` | absent (event did not request grouping).
- `markRunAdminManaged(tx, groupId): Promise<void>` exported from `src/lib/grouping/manager.ts`; a no-op when the run's trigger is already not `"automatic"`.
- `autoGroup(quizId, participantId, config)` keeps its signature and `GroupingResult` return shape.

**Failure modes**

- Quiz not found while resolving the owner: `autoGroup` throws; the submit route already catches it and returns `autoGrouping.evaluated = false` without failing the submission.
- Grouping transaction failure: event recorded as failed, error rethrown, submission unaffected.

**Acceptance criteria**

- `pnpm test` passes with integration tests covering every scenario in `specs/auto-grouping/spec.md`.
- Manual check on staging: three new submissions on a fresh quiz create groups visible on `/admin/groups/[quizId]`.

**Scope boundaries**

- In scope: `src/lib/grouping/manager.ts`, `src/lib/grouping/triggers.ts`, `src/app/api/admin/groups/[groupId]/members/route.ts`, test tooling.
- Out of scope: the submit route response shape, admin UI, grouping algorithms, the scores-page grouping form (change `fix-score-page-group-form`).

## Risks / Trade-offs

- [Existing runs become admin-managed] Every run created before this change lacks `trigger`, so quizzes that already have groups will never be auto-regrouped. Accepted: those groups were all created by admins.
- [Owner attribution hides the actor] Automatic runs show the quiz owner as creator; `config.trigger` is the only marker. Accepted for now; a UI indicator is a non-goal.
- [Test database prerequisite] Developers need a local `group_wise_test` database. The global setup fails fast with a message naming the database and the create command.
