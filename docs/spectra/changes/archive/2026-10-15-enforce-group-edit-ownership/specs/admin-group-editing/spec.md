## Purpose

Admin group editing lets the admin who owns a quiz move, swap and batch-move participants between that quiz's groups, and refuses the same edits from any other admin.

## ADDED Requirements

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
