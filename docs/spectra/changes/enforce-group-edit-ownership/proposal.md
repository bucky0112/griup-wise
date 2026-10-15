## Problem

Five admin member-edit APIs let any logged-in admin change the groups of a quiz owned by another admin (GitHub issue #13): `/api/admin/groups/move-participant`, `/api/admin/groups/batch-move`, `/api/admin/groups/[groupId]/members/move`, `/api/admin/groups/members/swap` and `/api/admin/groups/batch-operations`. Every other admin quiz and grouping API, including `PATCH /api/admin/groups/[groupId]/members`, only acts on quizzes whose `created_by` is the logged-in admin. Found while proposing `harden-auto-grouping-concurrency` on 2026-10-15; the automatic security review of PR #9 flagged the same gap.

## Root Cause

The five routes only check that the session is an admin and pass `session.id` to `groupingManager.moveParticipant`, `swapParticipants` or `batchMove`, which accept an `adminId` parameter but never use it (lint reports it as unused).

## Proposed Solution

- The three `groupingManager` edit methods resolve the quiz of the participants they edit (they already do so before taking the quiz lock) and refuse with `reason: 'forbidden'` and the message `無權限操作此分組` when `quizzes.created_by` differs from `adminId`, before any lock or write.
- `editFailureStatus` maps `forbidden` to HTTP 403, so the five routes answer 403 like the members `PATCH` route already does.

## Non-Goals (optional)

- Admin roles or shared quizzes between admins; ownership stays "the admin who created the quiz".
- Auditing other API areas (classes, reviews, answers) beyond the grouping member-edit routes listed above.
- Changing the UI; it already shows the API message as an error toast.

## Capabilities

- New Capabilities: `admin-group-editing`
- Modified Capabilities: none

## Success Criteria

- Each of the five routes returns 403 `無權限操作此分組` when the logged-in admin does not own the quiz, and the quiz's groups and members are unchanged.
- The owner's edits through the same routes behave as before.
- The unused-`adminId` lint warnings in `src/lib/grouping/manager.ts` disappear.

## Impact

- Affected code:
  - Modified: src/lib/grouping/manager.ts, src/lib/grouping/__integration__/grouping-concurrency.test.ts
  - New: src/lib/grouping/__integration__/group-edit-ownership.test.ts
  - Removed: none
- The five routes need no code change: they already pass `session.id` and use `editFailureStatus`.
- Lands on `fix/auto-grouping-failure` before PR #9 merges.
