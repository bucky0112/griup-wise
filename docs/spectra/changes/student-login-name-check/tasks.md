## 1. Failing tests

- [x] 1.1 Add `src/app/api/auth/student/__integration__/route.test.ts`: seed with `resetGroupingTables` and `seedQuiz` from `src/test/grouping-fixtures.ts`, mock `createSession` from `@/lib/session`, call the `POST` handler directly, and write one test per scenario of "Student login matches name and student number" in this change's authentication spec (all five rows of the name-matching example, and the concurrent first login run 10 times with `Promise.all`). Verify: before production changes, `pnpm test` fails the different-name test (200 instead of 409) and the concurrent first-login test (a 500), while the same-name and unavailable-quiz tests pass.

## 2. Name check

- [x] 2.1 [after: 1.1] Student login matches name and student number — per "Return a discriminated result from authenticateStudent" and "Compare names after trim and lowercase": `authenticateStudent` returns `StudentLoginResult` and, for an existing student number with a different name, returns `{ ok: false, reason: 'name_mismatch' }` without writing anything; `POST /api/auth/student` maps `name_mismatch` to 409 with `此學號已由其他姓名登入，請確認姓名與學號，或洽詢老師` and keeps 401 for `quiz_unavailable`; the single caller in `grouping-concurrency.test.ts` reads `result.ok` / `result.session`. Verify: every test from 1.1 except the concurrent first login passes, and "lets a student log in and submit while a grouping operation holds the quiz lock" still passes.
- [x] 2.2 [after: 2.1] Per "Insert with ON CONFLICT DO NOTHING, then re-read": a first-login insert that conflicts on the quiz and student number re-reads the existing participant and applies the same name check, so the outcome is 200 or 409, never 500. Verify: the concurrent first-login test passes 10/10 with exactly one `S002` participant, one 200 and one 409 each time.

## 3. Wrap-up

- [x] 3.1 [after: 2.2] Run `pnpm test` and `pnpm build`; both exit 0. `pnpm lint` adds no problems compared with the branch base.
- [ ] 3.2 [after: 3.1] Acceptance locally or on staging: logging in at `/quiz/[quizId]/login` with an existing student number and a different name shows the toast `此學號已由其他姓名登入，請確認姓名與學號，或洽詢老師`, and the same name enters the quiz. Record the result in the PR and close GitHub issue #7.
