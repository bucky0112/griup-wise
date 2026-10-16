# admin-group-editing Specification

## Purpose

Admin group editing lets the admin who owns a quiz move, swap and batch-move participants between that quiz's groups, and refuses the same edits from any other admin.

## Requirements

### Requirement: Only the quiz owner edits group membership

Every admin member-edit route (`/api/admin/groups/move-participant`, `/api/admin/groups/batch-move`, `/api/admin/groups/[groupId]/members/move`, `/api/admin/groups/members/swap`, `/api/admin/groups/batch-operations`, and `PATCH /api/admin/groups/[groupId]/members`) SHALL change membership only when the logged-in admin is the `created_by` of the quiz the edited participants belong to. Otherwise the route SHALL respond with HTTP 403 and the message `無權限操作此分組`, and the quiz's groups and members SHALL be unchanged. The ownership check SHALL run before the edit takes the quiz's grouping lock.

#### Scenario: Another admin tries to move a participant

- **WHEN** admin B calls `/api/admin/groups/move-participant` for a participant of a quiz created by admin A
- **THEN** the response status is 403 with the message `無權限操作此分組`
- **AND** the quiz's groups and members are unchanged

##### Example: one request per route

| Route | Caller | Expected status |
| ----- | ------ | --------------- |
| `POST /api/admin/groups/move-participant` | admin B | 403 |
| `POST /api/admin/groups/batch-move` | admin B | 403 |
| `PUT /api/admin/groups/[groupId]/members/move` | admin B | 403 |
| `PUT /api/admin/groups/members/swap` | admin B | 403 |
| `POST /api/admin/groups/batch-operations` (move) | admin B | 403 |
| `PATCH /api/admin/groups/[groupId]/members` | admin B | 403 |

#### Scenario: The owner moves a participant

- **WHEN** admin A calls `/api/admin/groups/move-participant` for a participant of a quiz admin A created, naming a group of the active run
- **THEN** the response status is 200 and the participant is in the target group

<!-- @trace
source: enforce-group-edit-ownership
updated: 2026-10-15
code:
  - src/lib/grouping/manager.ts
  - src/lib/grouping/__integration__/group-edit-ownership.test.ts
-->

---
### Requirement: Admin can place an ungrouped participant into a group

The group management page SHALL let an admin choose a group of the active run for any participant listed as ungrouped, and SHALL then add that participant to the chosen group through `POST /api/admin/groups/batch-move` and show the updated groups.

#### Scenario: Place an ungrouped participant

- **WHEN** an admin clicks "手動分組" for an ungrouped participant and chooses group 2
- **THEN** the participant appears in group 2
- **AND** the participant is no longer listed as ungrouped

<!-- @trace
source: add-manual-grouping-for-ungrouped
updated: 2026-10-16
code:
  - src/components/admin/GroupManagement.tsx
-->

---
### Requirement: Stale group views refresh after a rejected move

When a move from the group management page is rejected with HTTP 409, the page SHALL show the response message, close the move dialog and reload the groups.

#### Scenario: Move after another session regrouped

- **WHEN** an admin moves participants from a page opened before the quiz was regrouped
- **THEN** the page shows `分組已更新，請重新整理後再操作`
- **AND** the move dialog closes and the page shows the current groups

<!-- @trace
source: add-manual-grouping-for-ungrouped
updated: 2026-10-16
code:
  - src/components/admin/GroupManagement.tsx
-->
