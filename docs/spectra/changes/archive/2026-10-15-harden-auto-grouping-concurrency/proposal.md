## Problem

The code review of PR #9 (2026-10-15) found concurrency defects in the automatic grouping fix that must be resolved before merging:

1. An automatic regroup and an admin membership edit on the same quiz can deadlock. Postgres aborts one of them with error 40P01: the submission reports a failed grouping, or the admin gets a 500.
2. A burst of submissions after the trigger threshold regroups once per submission, replacing the groups each time, because no cooldown exists until the first regroup commits.
3. Two simultaneous submissions that both reach the threshold on a quiz with no grouping both try to create the first run; one fails on the `groups_quiz_order_unique` constraint and is recorded as a failed grouping.
4. Admin member edits validate membership before their transaction, so an edit that lands after an automatic regroup acts on deleted groups: the remove path reports success while changing nothing, and the move path returns a 500.
5. Once a quiz's grouping is admin-managed, every later submission still computes two ranking hashes and opens a locking transaction before skipping.

## Root Cause

- Lock order differs: admin edits write `group_members` first and update `grouping_runs` last (`markRunAdminManaged`), while `performGrouping` locks the active `grouping_runs` row first and then deletes `group_members`.
- The only lock is `SELECT ... FOR UPDATE` on the active run, which does not exist before the first grouping, and admin creation/regeneration routes take no lock at all.
- Since PR #9, the trigger event is recorded after the attempt, so the cooldown check cannot see a regroup that is still running.
- Membership checks in the edit paths run outside the transaction.
- The admin-managed check now runs only inside the regroup transaction, after the expensive ranking hash computation.

## Proposed Solution

- Serialize every operation that changes a quiz's grouping (automatic and admin grouping, create, regenerate, move, swap, batch move, members PATCH) by locking the quiz row with `SELECT ... FOR NO KEY UPDATE` as the first statement of its transaction. One lock, taken first, removes the inconsistent ordering and covers quizzes without a run.
- Inside the locked transaction, skip an automatic regroup with the cooldown reason when an automatic run for the quiz was created within the cooldown window.
- Re-read and validate membership inside the locked edit transaction; when the target groups no longer belong to the active run, reject the edit with HTTP 409 and a message asking the admin to reload.
- Restore a cheap admin-managed pre-check before the ranking hashes; the locked check stays authoritative.

- Follow-up from `/code-review 9` (2026-10-15): decide edit staleness by named group ids only and treat participants with only archived memberships as ungrouped (the first version left such participants permanently un-movable), answer 409 also for unknown group ids (regroups delete replaced groups, so they cannot be told apart), record ranking hashes and admin-grouping outcomes only for applied groupings, measure the cooldown with the database clock, and de-duplicate batch-move ids.

## Non-Goals (optional)

See design.md.

## Capabilities

- New Capabilities: none
- Modified Capabilities: `auto-grouping`

## Success Criteria

- Concurrent automatic regroups and admin edits on one quiz never surface error 40P01.
- Five simultaneous qualifying submissions produce exactly one active run and one regroup.
- Two simultaneous first-threshold submissions produce exactly one active run and no failed grouping event.
- An admin edit on groups replaced by an automatic regroup returns 409 and changes nothing.
- `pnpm test` covers each of the above with real concurrent connections.

## Impact

- Affected code:
  - Modified: src/lib/grouping/manager.ts, src/app/api/admin/groups/[groupId]/members/route.ts, src/app/api/admin/quizzes/[id]/groups/create/route.ts, src/app/api/admin/quizzes/[id]/groups/regenerate/route.ts, src/lib/grouping/__integration__/auto-grouping.test.ts, docs/spectra/specs/auto-grouping/spec.md
  - New: src/lib/grouping/quiz-lock.ts, src/lib/grouping/__integration__/grouping-concurrency.test.ts
  - Removed: none
- No migration. Student login and submission inserts take `FOR KEY SHARE` on the quiz row, which does not conflict with `FOR NO KEY UPDATE`, so students are not blocked by a running regroup.
- Same branch as PR #9 (`fix/auto-grouping-failure`); PR #9 merges after this change.
