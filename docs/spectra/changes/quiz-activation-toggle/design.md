## Context

Quizzes have `is_active` (default false). Student login (`authenticateStudent`), `/api/assignments/next` and `/api/assignments/submit` only accept active quizzes. The flag is set once by `QuizForm` on `/admin/quizzes/new`; `PATCH /api/admin/quizzes/[id]` (owner-checked, 403 otherwise) validates `{ show_group_publicly?: boolean }` only. `/admin/quizzes` is a server component that lists quizzes with a 進行中/未啟用 badge and a `ShareQuizLink` per quiz; `/admin/quizzes/[id]/questions` is a client component that loads the quiz (including `isActive`) from `/api/quizzes/[id]/quiz-info` and renders `ShareQuizLink` in its header. Dialogs use `@/components/ui/dialog`; `window.confirm` is avoided in new UI (it blocked browser automation during acceptance).

## Goals / Non-Goals

**Goals:**

- The owner can activate or deactivate a quiz at any time from the two pages where the share link lives.
- The share dialog no longer hands out a link that silently fails.

**Non-Goals:**

- A quiz edit page, scheduled activation, or letting students finish after deactivation.

## Decisions

### Extend the existing quiz PATCH with is_active

`updateQuizSchema` gains `is_active: z.boolean().optional()`; the update sets `isActive` when present and the response adds `is_active`. Ownership and the empty-body 400 stay as they are. Alternative: a dedicated `/activate` route; rejected because the route already owns quiz settings and its ownership check.

### One client toggle component for both pages

`QuizActivationToggle({ quizId, isActive, onChange? })` renders the button, the deactivate confirmation dialog, sends the PATCH, toasts, and reports the stored value: it calls `onChange(storedValue)` when given (question page updates its `quiz` state) and otherwise `router.refresh()` so the server-rendered list re-reads the badge. Alternative: duplicate the logic per page; rejected to keep one behavior.

### Pass isActive into ShareQuizLink

`ShareQuizLink` gains an optional `isActive` prop (default true so other callers keep today's dialog) and shows the inactive warning when it is false. Both pages pass the current value.

## Implementation Contract

- **Behavior**: as in the quiz-management delta spec — PATCH accepts `is_active`; `啟用測驗`/`停用測驗` on both pages, deactivate behind a confirmation dialog, the two toasts, failures keep state; share dialog warning for inactive quizzes.
- **Interface**: PATCH body `{ show_group_publicly?: boolean; is_active?: boolean }`, response `quiz: { id, title, show_group_publicly, is_active }`; `QuizActivationToggle(props: { quizId: string; isActive: boolean; onChange?: (isActive: boolean) => void })`; `ShareQuizLink` prop `isActive?: boolean`.
- **Failure modes**: non-2xx shows the server `message` (fallback `操作失敗，請稍後再試`) and keeps the state; network errors show the fallback.
- **Acceptance**: `src/app/api/admin/quizzes/[id]/__integration__/route.test.ts` covers the three API scenarios, including the student-login effect; UI scenarios are accepted in a local browser, since the suite has no DOM; `pnpm test`, `pnpm build`, `pnpm lint` pass.
- **Scope**: in scope — the PATCH route, the toggle component, the two pages, `ShareQuizLink`. Out of scope — `QuizForm`, student routes, other admin pages.

## Risks / Trade-offs

- [Deactivating during a test blocks pending submissions] → The confirmation dialog states it before anything changes.
- [Updating `is_active` waits on a running regroup's quiz row lock] → The wait lasts one regroup transaction; no deadlock because the PATCH takes no other grouping locks.
