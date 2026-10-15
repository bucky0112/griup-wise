## Problem

Automatic grouping after student submission never succeeds (GitHub issue #2). When the third submission reaches the trigger threshold, the submit response reports `autoGrouping.error = "Grouping evaluation failed"` and no groups are created. The next submission within five minutes reports `In cooldown period (5 minutes)`, so the system does not retry. Reproduced both locally and on the Railway staging site on 2026-10-15.

## Root Cause

1. `GroupingManager.autoGroup` in `src/lib/grouping/manager.ts` calls `performGrouping(quizId, config, 'system', evaluation)`. `performGrouping` writes that value into `grouping_runs.created_by`, which is a `uuid` column with a foreign key to `admins.id`. The string `'system'` is neither a uuid nor an admin id, so the insert fails and the whole grouping transaction rolls back.
2. `autoGroup` records the grouping event (with `should_trigger_grouping = true`) before attempting the grouping. `isInCooldownPeriod` in `src/lib/grouping/triggers.ts` treats any such recent event as a completed grouping, so a failed attempt still starts the five-minute cooldown.
3. The existing unit tests under `src/lib/grouping/__tests__/` mock the database, and Jest is not installed, so neither defect was caught.

## Proposed Solution

- Attribute automatic grouping runs to the quiz owner: `autoGroup` looks up `quizzes.created_by` for the quiz and passes that admin id to `performGrouping`. The run's config records `trigger: 'automatic'` so automatic runs remain distinguishable.
- Record the trigger event after the grouping attempt, storing the outcome (`grouping_status: 'succeeded' | 'failed'`) in `trigger_metadata`; the cooldown check ignores events whose grouping failed.
- Protect admin-owned grouping: automatic grouping skips the regroup when the quiz's active grouping run was created manually by an admin, or when an admin has edited the membership of an automatic run. Without this, fixing the defect would let every later submission silently replace groups an admin built or adjusted.
- Add Vitest as the project test runner with a `test` script, and cover the fix with an integration test against a dedicated local PostgreSQL test database.

## Non-Goals (optional)

See design.md.

## Capabilities

- New Capabilities: `auto-grouping`
- Modified Capabilities: none

## Success Criteria

- With three submitted participants, a fourth submission (or the third, when the threshold is met) creates an active grouping run whose `created_by` equals the quiz owner's admin id, and the submit response reports `autoGrouping.triggered = true` with `groupsCreated > 0`.
- When a grouping attempt fails, the next qualifying submission within five minutes attempts grouping again instead of reporting the cooldown.
- When the active run was created or adjusted by an admin, a qualifying submission leaves that run and its groups unchanged and the submit response reports why grouping was skipped.
- `pnpm test` runs the new integration tests and they pass.

## Impact

- Affected code:
  - Modified: src/lib/grouping/manager.ts, src/lib/grouping/triggers.ts, src/app/api/admin/groups/[groupId]/members/route.ts, package.json, pnpm-lock.yaml
  - New: vitest.config.ts, src/lib/grouping/__integration__/auto-grouping.test.ts, src/test/db.ts
  - Removed: none
- Database schema: no migration; `grouping_events.trigger_metadata` gains a `grouping_status` key.
- Existing grouping runs and the admin grouping pages are unaffected; the grouping-runs listing already joins `admins`, which keeps working because automatic runs now reference a real admin.
