## Purpose

Automatic grouping regroups a quiz's participants by score after student submissions, so an admin gets balanced groups without running grouping by hand, while never replacing groups an admin created or adjusted.

## ADDED Requirements

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

### Requirement: Automatic grouping preserves admin-owned groups

The system SHALL NOT replace a quiz's active grouping run through automatic grouping when that run was created by an admin action or when an admin has changed the membership of that run. An admin action is creating groups from the scores page, from the group management dialog, or by regenerating groups. A membership change is moving, swapping, or batch-moving participants, or replacing a group's members. When automatic grouping is skipped for this reason, the submit response SHALL report `autoGrouping.triggered = false` with a reason stating that the active grouping is admin-managed.

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

#### Scenario: Admin edit racing an automatic regroup is kept

- **WHEN** a submission meets the trigger conditions for a quiz whose active run is automatic
- **AND** an admin edit marks that run admin-managed after the trigger was evaluated but before the regroup writes
- **THEN** the active run, its groups and their members remain as the admin left them
- **AND** the submit response reports `autoGrouping.triggered = false` with the admin-managed reason

#### Scenario: Unadjusted automatic run is refreshed

- **WHEN** the quiz's active grouping run was created by automatic grouping and no admin has changed its membership
- **AND** a later submission meets the trigger conditions after the cooldown
- **THEN** the system replaces it with a new automatic run that includes the new participant
