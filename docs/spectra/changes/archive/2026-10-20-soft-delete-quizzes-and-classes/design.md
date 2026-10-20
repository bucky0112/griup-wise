## Context

Every delete in group-wise is a hard delete, and `src/lib/db/schema.ts` cascades class → quiz → questions / participants / submissions / answers / grouping runs / groups. The class `DELETE` handler refuses while any quiz references the class, and no quiz delete exists, so a class that ever had a quiz can never be removed. The admin chose soft delete without a restore screen during discussion.

Quiz lookups are written inline in each route and page (roughly 29 files select from `quizzes` and 7 from `classes`, counted with a grep for `from(quizzes)` / `from(classes)` in `src`). There is no shared "find my quiz" helper; ownership checks are repeated per route, plus one helper in `src/lib/grouping/manager.ts` used by group edits.

Railway runs `pnpm db:migrate` as the pre-deploy step (`.railway/railway.ts`), and the Vitest global setup migrates the test database, so a generated drizzle migration reaches every environment.

## Goals / Non-Goals

**Goals:**

- A quiz owner can delete a quiz, and then delete its class.
- Deleted rows and everything under them stay in the database.
- Admins no longer see deleted quizzes or classes, and cannot change a deleted quiz through any API.
- Students cannot log in to, fetch or submit a deleted quiz.

**Non-Goals:**

- Restore UI; restoring is `UPDATE ... SET deleted_at = NULL`.
- Soft delete for questions, participants or groups.
- Auditing every read-only query; pages reachable only from inside a deleted quiz (for example a participant answer page) are not changed.

## Decisions

### Nullable deleted_at timestamp on quizzes and classes

Add `deletedAt: timestamp('deleted_at', { withTimezone: true })` (nullable) to both tables. A timestamp over a boolean records when it happened at no extra cost. Generate the migration with `pnpm db:generate`.

### Deleting a quiz also deactivates it

The quiz soft-delete sets `deleted_at = now()` and `is_active = false` in one update. Student login (`authenticateStudent` in `src/lib/auth.ts`), `api/assignments/next` and `api/assignments/submit` already require `is_active = true`, so the student side needs no change and returns its existing "測驗不存在或未開放" message. Alternative rejected: adding `deleted_at` checks to the student routes duplicates a guarantee the inactive flag already gives.

### Quiz delete lives on the existing quiz route

Add `DELETE` to `src/app/api/admin/quizzes/[id]/route.ts`, next to the existing `PATCH`, with the same owner check (404 when missing, 403 when not the owner). Deleting an already-deleted quiz answers 404, like a missing one.

### Class delete becomes soft and checks only live quizzes

The class `DELETE` handler sets `deleted_at` instead of deleting the row, and its "related quizzes" check only counts quizzes whose `deleted_at` is null. A hard delete of the class is never issued, because the cascade would erase the soft-deleted quizzes with it.

### Filter inline with isNull rather than a new query layer

Each touched query adds `isNull(quizzes.deletedAt)` / `isNull(classes.deletedAt)` to its existing `where`. Alternative rejected: a shared `liveQuizzes()` helper or Postgres view would touch every one of the ~29 query sites and change patterns the rest of the codebase does not use. The cost of inline filters is that a new query can forget the filter; the student side is still protected by the inactive flag.

### Confirmation dialog follows DeleteParticipantButton

`DeleteQuizButton` mirrors `src/components/admin/DeleteParticipantButton.tsx`: an outline red "刪除" button, a `Dialog` with title "刪除測驗？" and a description naming the quiz, a destructive confirm button, toast on success/failure and `router.refresh()`.

## Implementation Contract

**Behavior**

- Quiz list: each quiz row has a "刪除" button. Confirming deletes the quiz; the row disappears and a toast "已刪除測驗" appears. Cancelling changes nothing.
- After deleting every quiz of a class, deleting that class from the class pages succeeds and the class disappears.
- Deleting a class that still has a live quiz shows the existing "無法刪除，此班級仍有關聯的測驗" message.
- A student opening a deleted quiz's link is refused with "測驗不存在或未開放，請檢查測驗代碼".

**Interface / data shape**

- `DELETE /api/admin/quizzes/{id}` → 200 `{ message: '測驗已刪除' }`; 401 without admin session; 404 `{ message: '測驗不存在' }` when missing or already deleted; 403 `{ message: '無權限修改此測驗' }` when owned by another admin.
- `DELETE /api/admin/classes/{id}` keeps its current status codes and messages; it now sets `classes.deleted_at`.
- Columns: `quizzes.deleted_at timestamptz null`, `classes.deleted_at timestamptz null`.

**Where deleted rows are hidden or refused**

| Surface | Deleted quiz | Deleted class |
| --- | --- | --- |
| Admin quiz list page, admin dashboard counts, groups list page, groups overview API, pending reviews API | not listed | its quizzes are already deleted |
| Class list page and class list API | n/a | not listed |
| Class detail page, class GET/PUT API | its quizzes not listed | not found (404) |
| Quiz PATCH, quiz-info, questions GET/POST/PUT/DELETE, participant DELETE, groups auto/create/regenerate, group edits via `manager.ts` owner check | 404 / refused as not found or forbidden | n/a |
| Scores page, group detail page | not found | n/a |
| Quiz create API | n/a | refused like a class that does not exist |

**Failure modes**: a deleted quiz is indistinguishable from a missing one to callers (404 / existing not-found messages); nothing new is surfaced.

**Acceptance criteria**

- Integration tests (Vitest, `__integration__`) cover: quiz DELETE by owner / other admin / already deleted; student login refused after delete; questions POST and quiz PATCH return 404 for a deleted quiz; class DELETE refused with a live quiz and allowed after deleting it, leaving the class row present with `deleted_at` set; quiz rows and their answers still exist after delete.
- Manual browser check: delete a quiz and then its class from the admin UI.
- `npm test`, `npm run lint` and `npx tsc --noEmit` pass.

**Scope**: in scope are the surfaces in the table above. Out of scope: participant answer page, review detail routes reached only from a deleted quiz, restore UI, question/participant/group deletes.

## Risks / Trade-offs

- [A future query forgets the `deleted_at` filter] → a deleted quiz could reappear in an admin list; students remain blocked because the quiz is inactive. Mitigated by the integration tests on the main lists and mutation routes.
- [Someone re-activates a deleted quiz] → the activation PATCH refuses deleted quizzes, so this needs a direct database edit.
- [Soft-deleted rows accumulate] → negligible at this app's scale; purge is a separate future decision.
