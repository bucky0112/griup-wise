## Context

`participants` is unique per `(quiz_id, student_no)`, and since #7 `authenticateStudent` refuses a known student number with a different name, so a mistaken first login blocks the real owner of that number. Rows that reference a participant — `submissions` (and through it `answers`), `group_members`, `grouping_events` — all use `ON DELETE CASCADE`. Grouping changes are serialized per quiz by `lockQuizForGrouping`; membership edits that should freeze automatic grouping call `markRunAdminManaged`. The scores page `/admin/scores/[quizId]` is a server component that lists submitted and unsubmitted participants in two tables; dialogs use `@/components/ui/dialog` and client actions refresh server pages with `router.refresh()` (as `QuizActivationToggle` does).

## Goals / Non-Goals

**Goals:**

- The quiz owner can remove a wrongly created participant so the student number can log in again.

**Non-Goals:**

- Editing participants, bulk deletion, undo, or deleting from the group page.

## Decisions

### Delete through a quiz-scoped admin route under the grouping lock

`DELETE /api/admin/quizzes/[id]/participants/[participantId]` checks the session is an admin (401), that the admin owns the quiz (403, before taking the lock, like the member edits), then in one transaction takes `lockQuizForGrouping`, deletes the participant row where both id and `quiz_id` match, and returns 404 `參與者不存在` when nothing was deleted. The cascades remove the rest. Taking the lock keeps the deletion from interleaving with a regroup that is reading members. Alternative: a top-level `/api/admin/participants/[id]` route; rejected because scoping by quiz makes ownership and the 404 for other quizzes explicit.

### Deleting a member does not mark the run admin-managed

The deletion does not call `markRunAdminManaged`. The user chose that only the deleted student leaves their group, so an automatic run stays automatic and the student who logs in again is placed by the next qualifying automatic regroup. This differs on purpose from the 移除組員 edit, which expresses a teacher's grouping decision.

### Client button with confirmation on the scores page

`DeleteParticipantButton({ quizId, participantId, studentNo, displayName })` renders 刪除, the confirmation dialog, sends the DELETE, toasts, and calls `router.refresh()` on success. Both tables get an 操作 cell with it (the 未交卷 table gains the column).

## Implementation Contract

- **Behavior**: as in the quiz-management delta spec — owner-only deletion with cascades, under the quiz lock, run status unchanged, number reusable; 刪除 on every scores-page row with a confirmation naming the student, toast `已刪除參與者`, page reload; failures keep the row and show the message.
- **Interface**: `DELETE /api/admin/quizzes/[id]/participants/[participantId]` → 200 `{ message: '已刪除參與者' }`, 401 / 403 `無權限修改此測驗` / 404 `參與者不存在`; `DeleteParticipantButton(props: { quizId: string; participantId: string; studentNo: string; displayName: string })`.
- **Failure modes**: database errors return 500 `刪除參與者失敗`; the UI shows server messages and a fallback `操作失敗，請稍後再試` for network errors.
- **Acceptance**: `src/app/api/admin/quizzes/[id]/participants/[participantId]/__integration__/route.test.ts` covers the four API scenarios (including re-login through the student route and the automatic run staying automatic); UI scenarios are accepted in a local browser because the suite has no DOM; `pnpm test`, `pnpm build`, `pnpm lint` pass.
- **Scope**: in scope — the new route, the button component, the scores page. Out of scope — grouping APIs, student routes, other admin pages.

## Risks / Trade-offs

- [Deleting a participant also deletes grouping events they triggered, including the one that started the current cooldown] → The next qualifying submission may regroup sooner; acceptable because the ranking already changed by removing a member.
- [Deletion is permanent] → The dialog names the student and states that answers and score are removed.
