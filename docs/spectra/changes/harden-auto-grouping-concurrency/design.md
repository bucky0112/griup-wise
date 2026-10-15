## Context

PR #9 (`fix-auto-grouping-failure`, archived 2026-10-15) made automatic grouping work and protected admin-managed runs with a `SELECT ... FOR UPDATE` on the active `grouping_runs` row inside `performGrouping`. Its `/code-review` found that this locking is incomplete:

- `moveParticipant`, `swapParticipants`, `batchMove` (`src/lib/grouping/manager.ts`) and `PATCH /api/admin/groups/[groupId]/members` write `group_members` first and call `markRunAdminManaged` (an `UPDATE grouping_runs`) last; `performGrouping` locks `grouping_runs` first and deletes `group_members` afterwards. Opposite lock order → deadlock (40P01).
- Before the first grouping there is no active run row, so nothing is locked; two first-time regroups race and the second fails on `groups_quiz_order_unique`.
- The cooldown is driven by `grouping_events` rows written after the regroup commits, so submissions arriving during a regroup do not see it and each regroups again.
- The admin create route (`/api/admin/quizzes/[id]/groups/create`) and regenerate route take no lock and can race automatic grouping.
- Edit paths read membership before their transaction; after a regroup they act on deleted groups.

The admin UI moves participants through `/api/admin/groups/move-participant` and `/api/admin/groups/batch-move`, which call the `groupingManager` methods and currently map any failure to HTTP 400.

## Goals / Non-Goals

**Goals:**

- One lock, always taken first, serializes every grouping change per quiz.
- At most one automatic regroup per cooldown window, including during a running regroup.
- Edits that target replaced groups change nothing and return 409.
- Admin-managed quizzes skip automatic grouping before any ranking work.

**Non-Goals:**

- Authorization of the member-edit routes (they do not check quiz ownership); tracked as GitHub issue #13.
- Edits applied to archived runs through participant lookups (GitHub issue #11) beyond what the active-run membership check rejects.
- Treating group rename or notes as admin adjustments (GitHub issue #12).
- Changing the trigger threshold, cooldown length, or grouping algorithm.
- UI changes beyond surfacing the 409 message through the existing error toast.

## Decisions

### Serialize grouping changes with a quiz row lock

Add `lockQuizForGrouping(tx, quizId)` in `src/lib/grouping/quiz-lock.ts`, which runs `SELECT id FROM quizzes WHERE id = $1 FOR NO KEY UPDATE` and throws when the quiz does not exist. Every transaction that changes groups calls it as its first statement: `performGrouping` (automatic and admin), `moveParticipant`, `swapParticipants`, `batchMove`, the members `PATCH` route, the create route and the regenerate route. Edit paths resolve the quiz id before the transaction from data that never changes (`participants.quiz_id` or `groups.quiz_id`).

`FOR NO KEY UPDATE` is chosen because inserts of participants, submissions and answers take `FOR KEY SHARE` on the referenced quiz row through their foreign keys, and those two lock modes do not conflict; students keep logging in and submitting while a regroup runs.

Alternatives considered: keep the active-run lock and reorder edit paths to take it first (rejected: still nothing to lock before the first run, and the create/regenerate routes would need their own fix); a Postgres transaction-scoped advisory lock keyed by quiz id (rejected: it needs the uuid hashed into a bigint key, and a reader has to know the hashing convention to find who holds it, while a row lock on `quizzes` is visible in `pg_locks` against the quiz itself).

The `FOR UPDATE` on the active run introduced by PR #9 is removed; the quiz lock supersedes it.

### Check the cooldown again under the lock

**Supersedes**: fix-auto-grouping-failure / Record the trigger event after the attempt

The cooldown filter changes from "not failed or skipped_admin_managed" to "succeeded or absent".

Inside the locked transaction, an automatic regroup first applies the admin-managed check, then skips with `CooldownGroupingError` when the quiz has a `grouping_runs` row with `config.trigger = "automatic"` created within the cooldown window (5 minutes). `autoGroup` maps it to the existing cooldown reason and records the event with `grouping_status: "skipped_cooldown"`.

`isInCooldownPeriod` now counts only events whose `grouping_status` is `succeeded` or absent (legacy and admin-triggered events), so skipped and failed attempts never extend the cooldown.

Alternative considered: record a "regroup started" event before the attempt (rejected: it would reintroduce the failed-attempt-starts-cooldown defect fixed in PR #9).

### Validate edits against the active run under the lock

After taking the quiz lock, each edit re-reads the memberships and groups it touches, restricted to groups of the quiz's active run. When a named group or membership is not part of the active run, the edit performs no writes and returns `{ success: false, reason: 'stale_grouping', message: '分組已更新，請重新整理後再操作' }` from the manager, or responds 409 directly in the members `PATCH` route. The member-edit routes map `reason: 'stale_grouping'` to HTTP 409 and keep 400 for other failures.

### Early admin-managed skip in autoGroup

`autoGroup` reads the active run before `evaluateSubmissionTrigger`. When it is admin-managed, it records a `skipped_admin_managed` event with `should_trigger_grouping = false` and no ranking hashes, and returns the admin-managed reason. The locked check inside `performGrouping` still catches runs that become admin-managed after this read.

## Implementation Contract

**Behavior**

- Concurrent grouping operations on one quiz run one after another; none fails with 40P01.
- Concurrent first-threshold submissions produce one active run and no failed event.
- During and within 5 minutes after an automatic regroup, further qualifying submissions report `In cooldown period (5 minutes)`.
- Member edits naming groups outside the active run return 409 `分組已更新，請重新整理後再操作` and write nothing.
- Submissions on admin-managed quizzes skip before ranking work.

**Interface / data shape**

- `lockQuizForGrouping(tx: DbExecutor, quizId: string): Promise<void>` exported from `src/lib/grouping/quiz-lock.ts`.
- `GroupEditResult` and `BatchOperationResult` gain optional `reason?: 'stale_grouping'`.
- `grouping_events.trigger_metadata.grouping_status` gains `"skipped_cooldown"`.

**Failure modes**

- Quiz missing in `lockQuizForGrouping`: throws; callers already surface 404/500 as today.
- Lock wait: operations queue on the quiz row; no timeout is added.

**Acceptance criteria**

- `src/lib/grouping/__integration__/grouping-concurrency.test.ts` runs each spec scenario with real concurrent transactions (`Promise.all` over the pool) and passes repeatedly (10 iterations per concurrent scenario).
- Existing tests in `auto-grouping.test.ts` keep passing; `pnpm build` succeeds; `pnpm lint` adds no problems.
- Staging: two browser-free curl bursts of 5 submissions produce one regroup; a stale move from the group management page shows the 409 message.

**Scope boundaries**

- In scope: `manager.ts`, `triggers.ts`, the new `quiz-lock.ts`, the create, regenerate and member-edit routes, tests, the `auto-grouping` spec.
- Out of scope: authorization of edit routes, archived-run membership lookups, UI redesign.

## Risks / Trade-offs

- [Quiz row contention] Admin edits to the quiz itself (title, active flag) wait behind a running regroup. Accepted: regroups take milliseconds to a second.
- [Concurrency tests are probabilistic] Interleavings vary per run; each concurrent scenario repeats 10 times to make a regression likely to show. A passing run is evidence, not proof.
- [Legacy events] Events written before PR #9 have no `grouping_status` and still count toward the cooldown, matching earlier behaviour.
