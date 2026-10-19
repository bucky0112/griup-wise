## Why

A student number can be used only once per quiz, and since #7 a second login with the same number and a different name is refused. When someone types the wrong number — for example a student uses `01` that belongs to a classmate — the real owner of `01` can no longer enter the quiz, and the teacher has no way to fix it.

## What Changes

- New `DELETE /api/admin/quizzes/[id]/participants/[participantId]`: the quiz owner removes a participant from the quiz. The participant's submission, answers, group memberships and grouping events go with it (existing cascades), so the student number is free to log in again.
- The scores page (`/admin/scores/[quizId]`) gets a 刪除 button on every row of both the 已交卷 and 未交卷 tables. It opens a confirmation dialog naming the student and warning that their answers and score are deleted; confirming deletes and reloads the page.
- If the participant was in a group of the active run, only their membership is removed; the run keeps its automatic or admin-managed status, so a later qualifying submission can regroup and include the student who logs in again.

## Non-Goals

- Editing a participant's name or student number.
- Bulk deletion, undo, or deleting participants from other pages.
- Changing the student-login name check from #7.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `quiz-management`: adds the requirement that the quiz owner can delete a participant and free their student number.

## Impact

- Affected specs: quiz-management
- Affected code:
  - Modified: src/app/admin/scores/[quizId]/page.tsx
  - New: src/app/api/admin/quizzes/[id]/participants/[participantId]/route.ts, src/app/api/admin/quizzes/[id]/participants/[participantId]/__integration__/route.test.ts, src/components/admin/DeleteParticipantButton.tsx
  - Removed: none
- No migration; relies on the existing `ON DELETE CASCADE` from submissions, answers, group_members and grouping_events to participants.
