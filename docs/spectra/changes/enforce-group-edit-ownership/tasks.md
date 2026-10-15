## 1. Failing ownership tests

- [x] 1.1 In `src/lib/grouping/__integration__/group-edit-ownership.test.ts`, seed a quiz owned by admin A with an automatic run of two groups, log in as admin B through the mocked session, and call each route from the spec's example table with a valid edit (`move-participant` and `[groupId]/members/move` with `{ participantId, targetGroupId }`, `batch-move` with `{ participantIds, targetGroupId }`, `members/swap` with `{ participant1Id, participant2Id }`, `batch-operations` with `{ operation: 'move', participantIds, targetGroupId }`, members `PATCH` with `{ participant_id, new_group_id }`); assert 403 `無權限操作此分組` and an unchanged grouping snapshot. Add one test where admin A moves a participant through `move-participant` and gets 200. Verify: before the production change the five manager-based routes return 200 (the members `PATCH` route already returns 403) and the owner test passes.

## 2. Ownership check

- [x] 2.1 [after: 1.1] Only the quiz owner edits group membership: `moveParticipant`, `swapParticipants` and `batchMove` in `src/lib/grouping/manager.ts` look up `quizzes.created_by` for the quiz resolved from the participants and return `{ success: false, reason: 'forbidden', message: '無權限操作此分組' }` before taking the quiz lock when it differs from `adminId`; `editFailureStatus` maps `forbidden` to 403. Verify: all tests in `group-edit-ownership.test.ts` pass, the existing tests that call these methods with the owner's id still pass, and `eslint src/lib/grouping/manager.ts` no longer reports `adminId` as unused.

## 3. Wrap-up

- [x] 3.1 [after: 2.1] Run `pnpm test` and `pnpm build`; both exit 0. `pnpm lint` adds no problems compared with the branch base.
- [x] 3.2 [after: 3.1] Staging acceptance after `railway up` of `fix/auto-grouping-failure`: the staging admin's own move through `/api/admin/groups/batch-move` still returns 200. A second staging admin account is not created for this check; the cross-admin 403 is covered by the integration tests. Record the result in PR #9, which then also closes GitHub issue #13.
