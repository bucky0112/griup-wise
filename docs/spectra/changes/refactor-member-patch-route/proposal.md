## Why

`PATCH /api/admin/groups/[groupId]/members` re-implements the quiz lock, the active-run check, the move and remove writes, the rank-index calculation and the ownership check that `groupingManager.moveParticipant` and `batchMove` already provide (GitHub issue #16). The third `/code-review` of PR #9 flagged that a future fix to one copy will be missed in the other.

## What Changes

- Add `groupingManager.removeParticipant(participantId, groupId, adminId)` for "make ungrouped", with the same ownership check, quiz lock, active-run validation and `markRunAdminManaged` as the other edit methods.
- Give `moveParticipant` an optional `fromGroupId`; when set, the participant must currently be a member of that group in the active run, otherwise it returns a new `reason: 'not_in_group'`.
- Rewrite the route to call these two methods and map their results to its current responses, so its status codes and messages stay exactly as they are today (200 `組員移動成功` / `組員移除成功`, 400 `該參與者不在此組別中` / `該參與者已在目標組別中`, 403 `無權限操作此分組`, 409 `分組已更新，請重新整理後再操作`).

## Non-Goals (optional)

- Changing any response of the route or of the other member-edit routes.
- Merging the five manager-based routes into fewer endpoints.

## Impact

- Affected specs: none (the existing `admin-group-editing` and `auto-grouping` scenarios for this route stay as they are and keep passing)
- Affected code:
  - Modified: src/lib/grouping/manager.ts, src/app/api/admin/groups/[groupId]/members/route.ts, src/lib/grouping/__integration__/grouping-concurrency.test.ts
  - New: src/lib/grouping/__integration__/member-patch-route.test.ts
  - Removed: none
