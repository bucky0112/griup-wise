# auto-grouping Specification

## Purpose

Automatic grouping regroups a quiz's participants by score after student submissions, so an admin gets balanced groups without running grouping by hand, while never replacing groups an admin created or adjusted.

## Requirements

### Requirement: Automatic grouping run attribution

When a student submission triggers automatic grouping, the system SHALL create the grouping run with `created_by` set to the admin who owns the quiz (`quizzes.created_by`) and SHALL record `trigger: "automatic"` in the run's `config`.

#### Scenario: Third submission creates an automatic run

- **WHEN** a quiz with no active grouping run receives the submission that brings its submitted participants to the trigger threshold of 3
- **THEN** the system creates one active grouping run whose `created_by` equals the quiz owner's admin id and whose `config.trigger` equals `"automatic"`
- **AND** the submit response reports `autoGrouping.triggered = true` and `autoGrouping.groupsCreated` greater than 0

##### Example: three submissions, default group size

- **GIVEN** quiz Q owned by admin A, with participants P1, P2, P3 and no grouping run
- **WHEN** P1, P2 and P3 submit in that order
- **THEN** after P3's submission Q has exactly 1 active grouping run with `created_by = A`, `config.trigger = "automatic"`, and 1 group containing P1, P2 and P3


<!-- @trace
source: fix-auto-grouping-failure
updated: 2026-10-15
code:
  - src/lib/grouping/manager.ts
  - src/lib/grouping/__integration__/auto-grouping.test.ts
-->

---
### Requirement: Cooldown only after a successful automatic grouping

The system SHALL start the automatic-grouping cooldown only when an automatic grouping attempt succeeds. A grouping attempt that fails SHALL NOT place the quiz in cooldown, and the trigger event for that attempt SHALL record `grouping_status: "failed"` in its `trigger_metadata`.

#### Scenario: Failed attempt does not start cooldown

- **WHEN** an automatic grouping attempt for a quiz fails
- **AND** another submission for the same quiz meets the trigger conditions within 5 minutes
- **THEN** the system attempts automatic grouping again instead of reporting `In cooldown period (5 minutes)`

#### Scenario: Successful attempt starts cooldown

- **WHEN** an automatic grouping attempt for a quiz succeeds
- **AND** another submission for the same quiz meets the trigger conditions within 5 minutes
- **THEN** the system does not regroup and the submit response reports the reason `In cooldown period (5 minutes)`


<!-- @trace
source: fix-auto-grouping-failure
updated: 2026-10-15
code:
  - src/lib/grouping/manager.ts
  - src/lib/grouping/triggers.ts
  - src/lib/grouping/__integration__/auto-grouping.test.ts
-->

---
### Requirement: Automatic grouping preserves admin-owned groups

The system SHALL NOT replace a quiz's active grouping run through automatic grouping when that run was created by an admin action or when an admin has changed that run. An admin action is creating groups from the scores page, from the group management dialog, or by regenerating groups. An admin change is moving, swapping, or batch-moving participants, replacing a group's members, or editing a group's name, notes or order through `PATCH /api/admin/groups/[groupId]`. When automatic grouping is skipped for this reason, the submit response SHALL report `autoGrouping.triggered = false` with a reason stating that the active grouping is admin-managed.

#### Scenario: Manually created run is kept

- **WHEN** the quiz's active grouping run was created by an admin from the group management dialog
- **AND** a new submission meets the trigger conditions
- **THEN** the active run, its groups and their members remain unchanged
- **AND** the submit response reports `autoGrouping.triggered = false` with the admin-managed reason

#### Scenario: Adjusted automatic run is kept

- **WHEN** the quiz's active grouping run was created by automatic grouping
- **AND** an admin moves one participant to another group of that run
- **AND** a later submission meets the trigger conditions after the cooldown
- **THEN** the active run, its groups and their members remain unchanged

#### Scenario: Renamed automatic run is kept

- **WHEN** the quiz's active grouping run was created by automatic grouping
- **AND** the quiz owner changes one of its groups' name from `第 1 組` to `火箭隊` through `PATCH /api/admin/groups/[groupId]`
- **AND** a later submission meets the trigger conditions after the cooldown
- **THEN** the active run, its groups and their members remain unchanged and the group is still named `火箭隊`
- **AND** the submit response reports `autoGrouping.triggered = false` with the admin-managed reason

#### Scenario: Admin edit racing an automatic regroup is kept

- **WHEN** a submission meets the trigger conditions for a quiz whose active run is automatic
- **AND** an admin edit marks that run admin-managed after the trigger was evaluated but before the regroup writes
- **THEN** the active run, its groups and their members remain as the admin left them
- **AND** the submit response reports `autoGrouping.triggered = false` with the admin-managed reason

#### Scenario: Unadjusted automatic run is refreshed

- **WHEN** the quiz's active grouping run was created by automatic grouping and no admin has changed it
- **AND** a later submission meets the trigger conditions after the cooldown
- **THEN** the system replaces it with a new automatic run that includes the new participant


<!-- @trace
source: auto-grouping-freeze-conditions
updated: 2026-10-19
code:
  - CLAUDE.md
-->

---
### Requirement: Grouping changes for a quiz are serialized

The system SHALL run operations that change a quiz's grouping one at a time per quiz. These operations are automatic grouping, admin grouping from the group management dialog, creating groups, regenerating groups, moving, swapping and batch-moving participants, replacing a group's members, and editing a group's name, notes or order. Concurrent operations on the same quiz SHALL complete without database deadlock errors, and the quiz SHALL never have more than one active grouping run. Student login and answer submission SHALL NOT wait for a running grouping operation.

#### Scenario: Automatic regroup and admin edit run at the same time

- **WHEN** an automatic regroup and an admin move on the same quiz start concurrently
- **THEN** neither operation fails with a deadlock error
- **AND** the quiz has exactly one active grouping run afterwards

#### Scenario: Automatic regroup and group rename run at the same time

- **WHEN** an automatic regroup and a group-details edit on the same quiz start concurrently
- **THEN** neither request fails with HTTP 500 or a deadlock error
- **AND** either the edit returns 200 and the run is kept with the new name, or the edit returns 409 and the regroup's run is active

#### Scenario: First grouping triggered by simultaneous submissions

- **WHEN** two submissions that both reach the trigger threshold are processed concurrently on a quiz with no grouping run
- **THEN** the quiz has exactly one active grouping run
- **AND** no grouping event for the quiz records `grouping_status: "failed"`

#### Scenario: Students keep working during a grouping operation

- **WHEN** a grouping operation holds the quiz's grouping lock
- **THEN** a student login and an answer submission for that quiz both complete without waiting for the lock


<!-- @trace
source: auto-grouping-freeze-conditions
updated: 2026-10-19
code:
  - CLAUDE.md
-->

---
### Requirement: Concurrent submissions regroup at most once per cooldown

When several qualifying submissions for a quiz are processed while an automatic regroup is running, the system SHALL perform only one regroup, and the other submissions SHALL report `autoGrouping.triggered = false` with the reason `In cooldown period (5 minutes)`, or `No ranking change detected` when the running regroup committed between their cooldown check and their ranking check and already applied their ranking. The cooldown window SHALL be measured with the database clock.

#### Scenario: Burst of submissions after the threshold

- **WHEN** five qualifying submissions for one quiz are processed concurrently
- **THEN** exactly one automatic grouping run is created
- **AND** each of the other four submissions reports the cooldown reason or `No ranking change detected`

##### Example: five concurrent submissions

- **GIVEN** a quiz with 3 submitted participants and no grouping run
- **WHEN** participants P4 to P8 submit concurrently
- **THEN** exactly 1 grouping run exists for the quiz and exactly 1 of the 5 results has `triggered = true`


<!-- @trace
source: harden-auto-grouping-concurrency
updated: 2026-10-15
code:
  - src/lib/grouping/manager.ts
  - src/lib/grouping/triggers.ts
  - src/lib/grouping/__integration__/grouping-concurrency.test.ts
-->

---
### Requirement: Admin member edits on replaced groups are rejected

An admin member edit (move, swap, batch move, or replacing a group's members) SHALL validate the group ids it names inside the same serialized operation. When a named group exists but no longer belongs to the quiz's active grouping run, the system SHALL change nothing, and every admin member-edit route (`/api/admin/groups/move-participant`, `/api/admin/groups/batch-move`, `/api/admin/groups/[groupId]/members/move`, `/api/admin/groups/members/swap`, `/api/admin/groups/batch-operations`, and `PATCH /api/admin/groups/[groupId]/members`) SHALL respond with HTTP 409 and the message `分組已更新，請重新整理後再操作`. A group id that does not exist SHALL get the same 409 response, because a regroup deletes the groups it replaces and the two cases cannot be told apart. Memberships a participant has only in archived runs SHALL NOT make an edit stale: such a participant counts as ungrouped, so moving or batch-moving them adds them to the target group, and swapping requires both participants to be in groups of the active run (otherwise HTTP 400).

#### Scenario: Move from the group management page after a regroup

- **WHEN** an admin moves a participant through `/api/admin/groups/move-participant` to a group id read before an automatic regroup replaced the quiz's groups
- **THEN** the response status is 409 with the message `分組已更新，請重新整理後再操作`
- **AND** the active grouping run and its members are unchanged

#### Scenario: Batch move from the group management page after a regroup

- **WHEN** an admin batch-moves participants through `/api/admin/groups/batch-move` to a group id read before an automatic regroup replaced the quiz's groups
- **THEN** the response status is 409 with the message `分組已更新，請重新整理後再操作`
- **AND** the active grouping run and its members are unchanged

#### Scenario: Edit arrives after an automatic regroup replaced the groups

- **WHEN** an admin removes a member using a group id read before an automatic regroup replaced the quiz's groups
- **THEN** the response status is 409 with the message `分組已更新，請重新整理後再操作`
- **AND** the active grouping run and its members are unchanged

#### Scenario: Edit names a group that never existed

- **WHEN** an admin sends a member edit naming a group id that does not exist
- **THEN** the response status is 409 with the message `分組已更新，請重新整理後再操作`

#### Scenario: Ungrouped participant with archived history is added

- **WHEN** a participant has a membership only in an archived run and none in the active run
- **AND** an admin moves that participant to a group of the active run
- **THEN** the participant becomes a member of that group
- **AND** the archived membership is unchanged

#### Scenario: Swap with an ungrouped participant

- **WHEN** an admin swaps a participant in the active run with a participant who has memberships only in archived runs
- **THEN** the response status is 400 and nothing changes


<!-- @trace
source: harden-auto-grouping-concurrency
updated: 2026-10-15
code:
  - src/lib/grouping/manager.ts
  - src/app/api/admin/groups/[groupId]/members/route.ts
  - src/app/api/admin/groups/move-participant/route.ts
  - src/app/api/admin/groups/batch-move/route.ts
  - src/app/api/admin/groups/[groupId]/members/move/route.ts
  - src/app/api/admin/groups/members/swap/route.ts
  - src/app/api/admin/groups/batch-operations/route.ts
  - src/lib/grouping/__integration__/grouping-concurrency.test.ts
-->

---
### Requirement: Admin-managed quizzes skip automatic grouping cheaply

When a quiz's active grouping run is admin-managed, the system SHALL decide to skip automatic grouping before evaluating the trigger and computing ranking hashes, and SHALL record the skip as a grouping event with `grouping_status: "skipped_admin_managed"` and no ranking hashes. The locked check inside the regroup transaction SHALL remain the authority for runs that become admin-managed after this early check.

#### Scenario: Submission on an admin-managed quiz

- **WHEN** a qualifying submission arrives for a quiz whose active run was created by an admin
- **THEN** the submission reports the reason `Active grouping is admin-managed`
- **AND** the grouping event recorded for that submission has `grouping_status: "skipped_admin_managed"` and empty `old_ranking_hash` and `new_ranking_hash`


<!-- @trace
source: harden-auto-grouping-concurrency
updated: 2026-10-15
code:
  - src/lib/grouping/manager.ts
  - src/lib/grouping/__integration__/grouping-concurrency.test.ts
-->

---
### Requirement: Grouping events reflect only applied groupings

The system SHALL record ranking hashes only on grouping events whose regroup succeeded, so a ranking that was skipped or failed is never treated as already grouped. Admin grouping events SHALL be recorded after the attempt with `grouping_status` `succeeded` or `failed`, so a failed admin grouping does not start the automatic-grouping cooldown. When a regroup has committed but recording its event fails, the submission SHALL still report the committed outcome, and a failure to record any skipped or non-triggering event SHALL NOT change the reported outcome either. Only grouping events (`submission` and `manual_trigger`) SHALL count toward the automatic-grouping cooldown; events written by other features, such as answer reviews, SHALL NOT. An automatic attempt that is skipped inside the regroup transaction SHALL be recorded with `should_trigger_grouping = false`, the same as every other skipped attempt.

#### Scenario: Skipped and failed attempts leave no ranking hash

- **WHEN** an automatic grouping attempt is skipped for the cooldown or fails
- **THEN** its grouping event has empty `old_ranking_hash` and `new_ranking_hash`
- **AND** the next qualifying submission after the cooldown evaluates the ranking as changed

#### Scenario: Failed admin grouping does not start the cooldown

- **WHEN** an admin grouping through `groupingManager.manualGroup` fails
- **THEN** its grouping event records `grouping_status: "failed"`
- **AND** a qualifying submission within 5 minutes is not rejected with the cooldown reason

#### Scenario: Grading an answer does not start the cooldown

- **WHEN** a review route records a `manual_review` or `batch_review` grouping event with `should_trigger_grouping = true`
- **AND** a qualifying submission for the same quiz arrives within 5 minutes
- **THEN** the submission is not rejected with the cooldown reason

#### Scenario: Skipped attempts are recorded as non-triggering

- **WHEN** an automatic attempt is skipped inside the regroup transaction for the cooldown or because the run is admin-managed
- **THEN** its grouping event has `should_trigger_grouping = false` and the matching `grouping_status`

#### Scenario: Event recording fails for a skipped submission

- **WHEN** writing the grouping event for a submission that does not regroup fails
- **THEN** `autoGroup` still returns `success: false` with the skip reason instead of throwing

#### Scenario: Event recording fails after a committed regroup

- **WHEN** an automatic regroup commits and writing its grouping event then fails
- **THEN** `autoGroup` returns `success: true` for that submission

<!-- @trace
source: harden-auto-grouping-concurrency
updated: 2026-10-15
code:
  - src/lib/grouping/manager.ts
  - src/lib/grouping/triggers.ts
  - src/lib/grouping/__integration__/grouping-concurrency.test.ts
-->

---
### Requirement: Group detail edits on replaced groups are rejected

`PATCH /api/admin/groups/[groupId]` SHALL validate, inside the serialized grouping operation for the quiz, that the group belongs to the quiz's active grouping run. When it does not, or when no group with that id exists, the system SHALL change nothing and respond with HTTP 409 and the message `分組已更新，請重新整理後再操作`. An admin who does not own the quiz SHALL get HTTP 403 and nothing changes. A successful edit SHALL mark an automatic run admin-managed in the same transaction as the update.

#### Scenario: Rename after a regroup replaced the groups

- **WHEN** the quiz owner renames a group using a group id read before an automatic regroup replaced the quiz's groups
- **THEN** the response status is 409 with the message `分組已更新，請重新整理後再操作`
- **AND** the active grouping run, its group names and members are unchanged

#### Scenario: Another admin edits the group

- **WHEN** an admin who does not own the quiz sends a group-details edit for a group of its active run
- **THEN** the response status is 403 and the group is unchanged


<!-- @trace
source: auto-grouping-freeze-conditions
updated: 2026-10-19
code:
  - CLAUDE.md
-->

---
### Requirement: Automatic grouping pauses while groups are visible to students

When a quiz has `show_group_publicly = true` and an active grouping run, automatic grouping SHALL NOT replace that run. The system SHALL decide this before evaluating the trigger and computing ranking hashes, and SHALL check it again under the quiz grouping lock before the regroup writes. A skipped submission SHALL report `autoGrouping.triggered = false` with the reason `Grouping is visible to students`, and its grouping event SHALL record `grouping_status: "skipped_published"`, `should_trigger_grouping = false` and no ranking hashes. When the active run is also admin-managed, the admin-managed reason SHALL be reported. When the quiz has no active grouping run, visibility SHALL NOT prevent automatic grouping. Setting `show_group_publicly` back to false SHALL let the next qualifying submission regroup.

#### Scenario: Visible automatic groups are kept

- **WHEN** the quiz's active run was created by automatic grouping and the owner sets `show_group_publicly` to true
- **AND** a later submission meets the trigger conditions after the cooldown
- **THEN** the active run, its groups and their members remain unchanged
- **AND** the submit response reports the reason `Grouping is visible to students` and the grouping event records `grouping_status: "skipped_published"` with empty `old_ranking_hash` and `new_ranking_hash`

#### Scenario: Hiding groups resumes automatic grouping

- **WHEN** the owner sets `show_group_publicly` back to false on that quiz
- **AND** the next submission meets the trigger conditions after the cooldown
- **THEN** the system replaces the active run with a new automatic run that includes the new participant

#### Scenario: First grouping on a quiz already visible to students

- **WHEN** a quiz with `show_group_publicly = true` has no grouping run
- **AND** the submission that reaches the trigger threshold arrives
- **THEN** the system creates an automatic grouping run

#### Scenario: Visibility turned on while a regroup is evaluating

- **WHEN** a submission passed the early visibility check for a quiz whose active run is automatic
- **AND** the owner sets `show_group_publicly` to true before the regroup takes the quiz grouping lock
- **THEN** the active run remains unchanged and the submission reports the reason `Grouping is visible to students`

<!-- @trace
source: auto-grouping-freeze-conditions
updated: 2026-10-19
code:
  - CLAUDE.md
-->