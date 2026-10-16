## Problem

On the group management page, the "手動分組" button next to each ungrouped participant does nothing (GitHub issue #14). Admins have no way in the UI to put an ungrouped participant (removed from a group, excluded, or submitted after grouping) into a group; batch mode only selects participants who are already in a group. Separately, when a batch move answers 409 because the groups were replaced, the dialog stays open and the page keeps showing the replaced groups.

## Root Cause

The button in the ungrouped-participants card of `src/components/admin/GroupManagement.tsx` has no `onClick`. `handleBatchMove` only works on `selectedParticipants`, and its error path neither closes the dialog nor reloads data.

## Proposed Solution

- "手動分組" opens a dialog listing the active run's groups for that participant; choosing a group sends `POST /api/admin/groups/batch-move` with that one participant. The API already accepts ungrouped participants (PR #9).
- Generalise the move handler to take participant ids, so batch mode and the new dialog share it.
- After a 409 (`分組已更新，請重新整理後再操作`) the handler shows the message, closes the dialog and reloads the groups, so the admin sees the current groups instead of stale ones.

## Non-Goals (optional)

- Drag-and-drop from the ungrouped list.
- Bulk-adding several ungrouped participants at once.
- API changes.

## Capabilities

- New Capabilities: none
- Modified Capabilities: `admin-group-editing` (new requirements only)

## Success Criteria

- Clicking "手動分組" and choosing a group moves that participant into it, and the ungrouped list no longer shows them.
- A move rejected with 409 closes the dialog, shows the message and reloads the groups.

## Impact

- Affected code:
  - Modified: src/components/admin/GroupManagement.tsx
  - New: none
  - Removed: none
- Spec: adds two requirements to the existing `admin-group-editing` capability; no ordering dependency on other open changes.
