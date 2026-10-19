## 1. API

- [x] 1.1 Quiz owner changes whether a quiz is active — per "Extend the existing quiz PATCH with is_active": write `src/app/api/admin/quizzes/[id]/__integration__/route.test.ts` first (mocked admin session, `seedQuiz` from `src/test/grouping-fixtures.ts`, student login through the `POST /api/auth/student` handler with `createSession` mocked) for the three API scenarios and a non-boolean `is_active` returning 400; confirm the activate and deactivate tests fail, then let the PATCH accept and return `is_active`. Verify: the new tests pass.

## 2. Pages

- [x] 2.1 [after: 1.1] Admin toggles activation from the quiz pages and Share dialog warns about inactive quizzes — per "One client toggle component for both pages" and "Pass isActive into ShareQuizLink": add `QuizActivationToggle` with the deactivate confirmation dialog, place it next to 分享連結 on `/admin/quizzes` (refreshing the server list) and `/admin/quizzes/[id]/questions` (updating page state), and pass `isActive` to `ShareQuizLink`, which shows the inactive warning. Verify: in a local browser, activating from the question page shows the toast and `停用測驗`; deactivating from the list opens the dialog, cancel keeps 進行中, confirm shows 未啟用 and `啟用測驗`; the share dialog warns only while inactive; a student login fails while inactive and succeeds after activation.

## 3. Wrap-up

- [x] 3.1 [after: 2.1] Run `pnpm test` and `pnpm build`; both exit 0, and `pnpm lint` reports no problems. Record the browser acceptance in this file and close GitHub issue #40 through the PR.

Note on browser acceptance (2026-10-19, local dev server against the local database, an inactive quiz 「驗收測驗 #40 啟用切換」): on the question page the share dialog showed the inactive warning; 啟用測驗 toasted `測驗已啟用，學生可以用分享連結進入`, the button became 停用測驗 and the warning disappeared, and a student login went from 401 to 200. On the quiz list, 停用測驗 opened the confirmation dialog; 取消 kept 進行中, 確定停用 toasted `測驗已停用`, showed 未啟用 with 啟用測驗, and student login returned 401 `測驗不存在或未開放，請檢查測驗代碼`. A 403 injected by stubbing `fetch` showed its message and kept 未啟用. UI scenarios rely on this check because the suite runs in Node without a DOM; the API scenarios are covered by `src/app/api/admin/quizzes/[id]/__integration__/route.test.ts`. `pnpm test` (164 passed), `pnpm build` and `pnpm lint` passed after the last code change.
