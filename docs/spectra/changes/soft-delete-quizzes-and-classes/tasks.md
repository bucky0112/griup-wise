## 1. Data model

- [x] 1.1 Quizzes and classes have a nullable `deleted_at` column: add `deletedAt` to `quizzes` and `classes` in `src/lib/db/schema.ts` and generate the migration with `pnpm db:generate` (design: "Nullable deleted_at timestamp on quizzes and classes"). Verify: the generated SQL in `src/lib/db/migrations` only adds the two columns, and `npm test` passes (the Vitest global setup applies it to the test database).

## 2. Quiz owner soft-deletes a quiz

- [x] 2.1 [after: 1.1] Quiz owner soft-deletes a quiz through `DELETE /api/admin/quizzes/{id}` in `src/app/api/admin/quizzes/[id]/route.ts`: sets `deleted_at` and `is_active = false` in one update, keeps all child rows, answers 403 for another admin and 404 for a missing or already-deleted quiz (design: "Deleting a quiz also deactivates it", "Quiz delete lives on the existing quiz route"). Verify with new integration tests in `src/app/api/admin/quizzes/[id]/__integration__/` covering the spec scenarios "Owner deletes a quiz", "Another admin cannot delete it", "Deleting twice" and "Students are refused after deletion".
- [x] 2.2 [after: 2.1] Quiz list offers quiz deletion: new `src/components/admin/DeleteQuizButton.tsx` following `DeleteParticipantButton` (design: "Confirmation dialog follows DeleteParticipantButton"), rendered on each row of `src/app/admin/quizzes/page.tsx`, and the list query excludes deleted quizzes. Verify manually in the browser: cancel keeps the quiz with no request sent; confirm shows `已刪除測驗` and removes the row.

## 3. Deleted quizzes are hidden from admins and cannot be changed

- [x] 3.1 [after: 2.1] Deleted quizzes are hidden from admins and cannot be changed through quiz-scoped APIs: the quiz lookups in `PATCH /api/admin/quizzes/{id}`, `api/quizzes/[id]/quiz-info`, `api/quizzes/[id]/questions` (GET/POST), `api/quizzes/[id]/questions/[questionId]` (PUT/DELETE/GET), the participant DELETE route, the groups `auto` / `create` / `regenerate` routes and the quiz owner check in `src/lib/grouping/manager.ts` add `isNull(quizzes.deletedAt)` so a deleted quiz answers as missing (design: "Filter inline with isNull rather than a new query layer"). Verify with integration tests matching the "refused changes" example table (questions POST and quiz PATCH return 404 and store nothing).
- [x] 3.2 [after: 1.1] Admin lists and quiz pages hide deleted quizzes: the admin dashboard (`src/app/admin/page.tsx`), groups list page, groups overview API, pending reviews API, scores page and group detail page exclude deleted quizzes, and the latter two show not-found for a deleted quiz. Verify manually in the browser after 2.2: a deleted quiz is absent from the dashboard and groups pages, and its scores URL shows the not-found page.
- [x] 3.3 [after: 3.1] Deleted quizzes stay unchangeable and unreadable under concurrency and on the remaining quiz-scoped admin reads: the `PATCH` and `DELETE` updates in `src/app/api/admin/quizzes/[id]/route.ts` also require `deleted_at IS NULL` (404 when the update matches nothing), and the `scores`, `groups`, `grouping-runs` and `grouping-events` GET routes under `src/app/api/admin/quizzes/[id]/` treat a deleted quiz as missing; integration tests check that `GET /api/admin/quizzes` and `GET /api/admin/classes` omit deleted rows. Verify with `npx vitest run src/app/api/admin`.

## 4. Classes

- [x] 4.1 [after: 1.1] Admin soft-deletes a class without live quizzes: the class `DELETE` handler in `src/app/api/admin/classes/[id]/route.ts` sets `deleted_at` instead of deleting, and its related-quiz check counts only quizzes without `deleted_at` (design: "Class delete becomes soft and checks only live quizzes"). Verify with integration tests for the spec scenarios "Class with only deleted quizzes" (class and quiz rows still present) and "Class with a live quiz".
- [x] 4.2 [after: 4.1] Deleted classes are hidden from admins: class list page and class list API exclude deleted classes; class GET/PUT and the class detail page treat a deleted class as missing; the class detail page lists only live quizzes; quiz creation in `src/app/api/admin/quizzes/route.ts` refuses a deleted class. Verify with an integration test for "Creating a quiz in a deleted class" and a manual browser check that a deleted class is gone from the class list.
- [x] 4.3 [after: 4.1] The class delete confirmation no longer claims deletion is irreversible: `DeleteClassButton` asks `確定要刪除班級「<name>」嗎？刪除後班級會從列表中移除，若需復原請聯絡系統管理者。`, matching the quiz delete dialog. Verify by content review of `src/components/admin/DeleteClassButton.tsx` and `npm run lint`.

## 5. Acceptance

- [x] 5.1 [after: 2.2, 3.1, 3.2, 4.2] The "小尖兵-測試" example works end to end on the local app: delete its quiz from the quiz list, then delete the class from the class pages; both disappear and a student login to the quiz is refused. Verify manually in the browser.
- [x] 5.2 [after: 5.1] The full suite, type check and lint pass: `npm test`, `npx tsc --noEmit`, `npm run lint`.
