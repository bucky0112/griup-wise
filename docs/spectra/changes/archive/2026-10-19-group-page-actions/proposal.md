## Why

Three buttons on the group management page (`/admin/groups/[id]`) have no click handler, so they do nothing (GitHub issue #33). Teachers cannot make groups visible to students, rename a group, or export the group list without calling the API by hand. Since #15, visibility also pauses automatic grouping, so a teacher who cannot toggle it in the UI cannot resume automatic grouping either.

## What Changes

- **公開分組** becomes a toggle that shows whether groups are visible to students and switches `show_group_publicly` through the existing `PATCH /api/admin/quizzes/[id]`. Turning it on tells the teacher that automatic grouping pauses while groups are visible.
- **編輯組別** opens a dialog prefilled with the group's name and notes and saves through the existing `PATCH /api/admin/groups/[groupId]`. Saving counts as an admin adjustment, which the dialog states. A 409 shows the server message, closes the dialog and reloads the groups.
- **匯出分組名單** downloads a CSV built in the browser from the groups already on the page: group name, student number, display name and score, followed by ungrouped participants under `未分組`.

## Non-Goals

- Editing a group's order from the dialog.
- Server-side export, other formats (Excel, PDF) or exporting members' answers.
- Any change to the visibility, group-details or grouping APIs.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `group-management-page`: adds requirements for toggling group visibility, editing a group's name and notes, and exporting the group list as CSV.

## Impact

- Affected specs: group-management-page
- Affected code:
  - Modified: src/components/admin/GroupManagement.tsx, src/app/admin/groups/[id]/page.tsx
  - New: src/lib/grouping/group-csv.ts, src/lib/grouping/__unit__/group-csv.test.ts
  - Removed: none
- No API, schema or migration change.
