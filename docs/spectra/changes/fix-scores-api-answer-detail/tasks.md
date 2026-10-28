## 1. Failing test

- [x] 1.1 Add an integration test for the "Scores API reports per-question earned scores" requirement in `src/app/api/admin/quizzes/[id]/scores/__integration__/route.test.ts`, calling the route's `GET` as the quiz owner (session mocked the same way as `src/app/api/admin/quizzes/[id]/participants/[participantId]/__integration__/route.test.ts`). Seed the quiz with `seedQuiz` from `src/test/grouping-fixtures.ts` plus questions, participants, submissions and answers matching the spec example (A: Q1=10, Q2=0, no Q3 row; B: Q1=0, Q2=10, Q3=5; C not submitted) and assert every `answers_detail[].earned_score` and `max_score` from the example table, and that C's `answers_detail` is empty. Verification: `pnpm test src/app/api/admin/quizzes/[id]/scores` runs the test and it fails on the current code because A's Q1 and B's Q2/Q3 come back as 0.

## 2. Fix

- [x] 2.1 [after: 1.1] Make the scores route look up each submitted participant's answers by that participant's submission id: the submission query in `GET /api/admin/quizzes/[id]/scores` also selects `submissions.id`, and the `answersMap` lookup uses it instead of `participant_id`. Response shape, ranking and statistics stay unchanged. Verification: the test from 1.1 passes.
- [x] 2.2 [after: 2.1] Run the full suite and lint. Verification: `pnpm test` and `pnpm lint` both pass with no new warnings.
