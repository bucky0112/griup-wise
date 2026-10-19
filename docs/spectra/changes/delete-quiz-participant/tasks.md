## 1. API

- [x] 1.1 Quiz owner deletes a participant — per "Delete through a quiz-scoped admin route under the grouping lock" and "Deleting a member does not mark the run admin-managed": write `src/app/api/admin/quizzes/[id]/participants/[participantId]/__integration__/route.test.ts` first (mocked session, fixtures from `src/test/grouping-fixtures.ts`, re-login through the `POST /api/auth/student` handler) for the four API scenarios of the spec; confirm they fail because the route does not exist, then add the route. Verify: the new tests pass and `grouping-concurrency.test.ts` still passes.

## 2. Scores page

- [x] 2.1 [after: 1.1] Scores page offers participant deletion — per "Client button with confirmation on the scores page": add `DeleteParticipantButton` and an 操作 cell with it to both tables of `/admin/scores/[quizId]`. Verify: in a local browser, cancel keeps the row; confirming on a submitted participant shows `已刪除參與者` and removes the row; afterwards the same student number logs in with another name (200).

## 3. Wrap-up

- [x] 3.1 [after: 2.1] Run `pnpm test` and `pnpm build`; both exit 0, and `pnpm lint` reports no problems. Record the browser acceptance in this file.

Note on browser acceptance (2026-10-19, local dev server against the local database): 李大華 logged in with student number `01` and submitted, after which 王小明 with `01` got 409. On `/admin/scores/[quizId]` both tables showed 刪除. The dialog read 「將刪除 01 李大華 的作答與分數，且無法復原。刪除後這個學號可以重新登入。」; 取消 kept the row, 確定刪除 toasted `已刪除參與者` and the row disappeared, and 王小明 then logged in with `01` (200) and appeared on the page. A 403 injected by stubbing `fetch` showed its message and kept both the row and the dialog; confirming again deleted the unsubmitted participant 陳小美. UI scenarios rely on this check because the suite runs in Node without a DOM; the API scenarios are covered by `src/app/api/admin/quizzes/[id]/participants/[participantId]/__integration__/route.test.ts`. `pnpm test` (169 passed), `pnpm build` and `pnpm lint` passed after the last code change.
