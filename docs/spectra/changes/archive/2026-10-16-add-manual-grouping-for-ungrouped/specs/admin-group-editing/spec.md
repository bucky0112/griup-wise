## ADDED Requirements

### Requirement: Admin can place an ungrouped participant into a group

The group management page SHALL let an admin choose a group of the active run for any participant listed as ungrouped, and SHALL then add that participant to the chosen group through `POST /api/admin/groups/batch-move` and show the updated groups.

#### Scenario: Place an ungrouped participant

- **WHEN** an admin clicks "手動分組" for an ungrouped participant and chooses group 2
- **THEN** the participant appears in group 2
- **AND** the participant is no longer listed as ungrouped

### Requirement: Stale group views refresh after a rejected move

When a move from the group management page is rejected with HTTP 409, the page SHALL show the response message, close the move dialog and reload the groups.

#### Scenario: Move after another session regrouped

- **WHEN** an admin moves participants from a page opened before the quiz was regrouped
- **THEN** the page shows `分組已更新，請重新整理後再操作`
- **AND** the move dialog closes and the page shows the current groups
