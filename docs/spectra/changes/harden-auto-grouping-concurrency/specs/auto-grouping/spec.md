## ADDED Requirements

### Requirement: Grouping changes for a quiz are serialized

The system SHALL run operations that change a quiz's grouping one at a time per quiz. These operations are automatic grouping, admin grouping from the group management dialog, creating groups, regenerating groups, moving, swapping and batch-moving participants, and replacing a group's members. Concurrent operations on the same quiz SHALL complete without database deadlock errors, and the quiz SHALL never have more than one active grouping run. Student login and answer submission SHALL NOT wait for a running grouping operation.

#### Scenario: Automatic regroup and admin edit run at the same time

- **WHEN** an automatic regroup and an admin move on the same quiz start concurrently
- **THEN** neither operation fails with a deadlock error
- **AND** the quiz has exactly one active grouping run afterwards

#### Scenario: First grouping triggered by simultaneous submissions

- **WHEN** two submissions that both reach the trigger threshold are processed concurrently on a quiz with no grouping run
- **THEN** the quiz has exactly one active grouping run
- **AND** no grouping event for the quiz records `grouping_status: "failed"`

#### Scenario: Students keep working during a grouping operation

- **WHEN** a grouping operation holds the quiz's grouping lock
- **THEN** a student login and an answer submission for that quiz both complete without waiting for the lock

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

### Requirement: Admin-managed quizzes skip automatic grouping cheaply

When a quiz's active grouping run is admin-managed, the system SHALL decide to skip automatic grouping before evaluating the trigger and computing ranking hashes, and SHALL record the skip as a grouping event with `grouping_status: "skipped_admin_managed"` and no ranking hashes. The locked check inside the regroup transaction SHALL remain the authority for runs that become admin-managed after this early check.

#### Scenario: Submission on an admin-managed quiz

- **WHEN** a qualifying submission arrives for a quiz whose active run was created by an admin
- **THEN** the submission reports the reason `Active grouping is admin-managed`
- **AND** the grouping event recorded for that submission has `grouping_status: "skipped_admin_managed"` and empty `old_ranking_hash` and `new_ranking_hash`

### Requirement: Grouping events reflect only applied groupings

The system SHALL record ranking hashes only on grouping events whose regroup succeeded, so a ranking that was skipped or failed is never treated as already grouped. Admin grouping events SHALL be recorded after the attempt with `grouping_status` `succeeded` or `failed`, so a failed admin grouping does not start the automatic-grouping cooldown. When a regroup has committed but recording its event fails, the submission SHALL still report the committed outcome.

#### Scenario: Skipped and failed attempts leave no ranking hash

- **WHEN** an automatic grouping attempt is skipped for the cooldown or fails
- **THEN** its grouping event has empty `old_ranking_hash` and `new_ranking_hash`
- **AND** the next qualifying submission after the cooldown evaluates the ranking as changed

#### Scenario: Failed admin grouping does not start the cooldown

- **WHEN** an admin grouping through `groupingManager.manualGroup` fails
- **THEN** its grouping event records `grouping_status: "failed"`
- **AND** a qualifying submission within 5 minutes is not rejected with the cooldown reason

#### Scenario: Event recording fails after a committed regroup

- **WHEN** an automatic regroup commits and writing its grouping event then fails
- **THEN** `autoGroup` returns `success: true` for that submission
