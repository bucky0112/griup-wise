# manual-grouping Specification

## Purpose

Manual grouping lets an admin create score-based groups for a quiz from the admin pages, with the group size defaulting to the class's ideal group size.

## Requirements

### Requirement: Create groups from the scores page

The scores page SHALL let an admin create groups for the quiz by submitting group size, minimum groups, maximum groups and whether to include unsubmitted participants. Submitting SHALL create a new active grouping run through the create-groups API using the snake-by-score strategy and SHALL navigate to the quiz's group management page on success. On failure the page SHALL show the API's error message and keep the entered values.

#### Scenario: Successful creation

- **WHEN** an admin submits the scores-page grouping form with valid values
- **THEN** a new active grouping run exists for the quiz
- **AND** the browser shows `/admin/groups/[quizId]` listing the new groups

##### Example: seven submitted participants

- **GIVEN** a quiz with 7 submitted participants and no grouping
- **WHEN** the admin submits group size 3, minimum groups 1, maximum groups 20, unsubmitted excluded
- **THEN** 3 groups are created containing all 7 participants

#### Scenario: API rejects the request

- **WHEN** an admin submits the form for a quiz that has no eligible participants
- **THEN** the page shows the message returned by the API
- **AND** the admin stays on the scores page with the entered values unchanged

#### Scenario: Existing grouping is about to be replaced

- **WHEN** the scores page is shown for a quiz that already has an active grouping run
- **THEN** the grouping form states that creating groups replaces the current grouping


<!-- @trace
source: fix-score-page-group-form
updated: 2026-10-16
code:
  - src/components/admin/CreateGroupsForm.tsx
  - src/app/admin/scores/[quizId]/page.tsx
-->

---
### Requirement: Creating groups replaces the active grouping

When the quiz already has an active grouping run, the create-groups API SHALL succeed, SHALL archive the previous run, and SHALL leave the new run's groups as the only groups of the quiz. If creating the new run fails, the previous grouping SHALL remain active and unchanged.

#### Scenario: Creating groups twice

- **WHEN** an admin creates groups for a quiz that already has an active run created by the create-groups API
- **THEN** the request succeeds
- **AND** the quiz has exactly one active run, the previous run is archived, and every group of the quiz belongs to the new run

##### Example: regroup with a different size

- **GIVEN** a quiz with 4 submitted participants grouped by the create-groups API with group size 2 (2 groups)
- **WHEN** the admin creates groups again with group size 4
- **THEN** the response status is 200
- **AND** the quiz has 1 group, named "第 1 組", containing all 4 participants

#### Scenario: Creating groups after automatic grouping

- **WHEN** an admin creates groups for a quiz whose active run was created by automatic grouping
- **THEN** the request succeeds and the automatic run is archived


<!-- @trace
source: fix-score-page-group-form
updated: 2026-10-16
code:
  - src/app/api/admin/quizzes/[id]/groups/create/route.ts
  - src/lib/grouping/__integration__/create-groups-route.test.ts
-->

---
### Requirement: Default group size follows the class setting

Every admin entry point that starts grouping SHALL pre-fill the group size with the quiz's class `target_group_size`, and SHALL use 4 when the class has no `target_group_size`. The entry points are the scores-page grouping form, the group management "自訂分組設定" dialog, and the group management one-click "自動分組" button.

#### Scenario: Class defines an ideal group size

- **WHEN** an admin opens any grouping entry point for a quiz whose class `target_group_size` is set
- **THEN** the group size used is the class `target_group_size`

##### Example: default resolution

| Class target_group_size | Default group size |
| ----------------------- | ------------------ |
| 3                       | 3                  |
| 6                       | 6                  |
| null                    | 4                  |

#### Scenario: One-click grouping uses the class setting

- **WHEN** an admin clicks "自動分組" on the group management page for a quiz whose class `target_group_size` is 3
- **THEN** the grouping request sends `target_group_size` 3

<!-- @trace
source: fix-score-page-group-form
updated: 2026-10-16
code:
  - src/lib/grouping/default-group-size.ts
  - src/lib/grouping/__unit__/default-group-size.test.ts
  - src/app/admin/groups/[id]/page.tsx
  - src/components/admin/GroupManagement.tsx
  - src/app/admin/scores/[quizId]/page.tsx
-->