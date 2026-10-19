## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Group detail edits on replaced groups are rejected

`PATCH /api/admin/groups/[groupId]` SHALL validate, inside the serialized grouping operation for the quiz, that the group belongs to the quiz's active grouping run. When it does not, or when no group with that id exists, the system SHALL change nothing and respond with HTTP 409 and the message `分組已更新，請重新整理後再操作`. An admin who does not own the quiz SHALL get HTTP 403 and nothing changes. A successful edit SHALL mark an automatic run admin-managed in the same transaction as the update.

#### Scenario: Rename after a regroup replaced the groups

- **WHEN** the quiz owner renames a group using a group id read before an automatic regroup replaced the quiz's groups
- **THEN** the response status is 409 with the message `分組已更新，請重新整理後再操作`
- **AND** the active grouping run, its group names and members are unchanged

#### Scenario: Another admin edits the group

- **WHEN** an admin who does not own the quiz sends a group-details edit for a group of its active run
- **THEN** the response status is 403 and the group is unchanged

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
