## 1. Shared answered rule

- [x] 1.1 Implement the Shared isAnswered helper in src/lib: add `isAnswered(questionType, response)` in `src/lib/answered.ts` that follows the Unanswered question rule table in design.md (`false`/`0` answered; `''`, `[]`, `null`, absent, whitespace-only short_text string or `{ content }` unanswered). Verify with a new unit test `src/lib/__unit__/answered.test.ts` covering every row of the table; write it first and confirm it fails before the helper exists.

## 2. Submit API

- [x] 2.1 Support Submit with unanswered questions in `POST /api/assignments/submit`: remove the missing-answer 400 response (`請完成所有題目後再提交`) so a body with absent or empty answers is accepted, keeping the 401, inactive-quiz, already-submitted, no-questions and zod 400 responses. Verify with a new integration test `src/app/api/assignments/submit/__integration__/route.test.ts` (follow the setup in `src/app/api/auth/student/__integration__/route.test.ts`) asserting `{ answers: {} }` returns 200 with total score 0. [after: 1.1]
- [x] 2.2 Store and score unanswered questions: in the submit route, use `isAnswered` per question and Store unanswered questions as JSON null (`sql\`'null'::jsonb\``, `earnedScore` `'0'`, `reviewStatus` `'auto'`), so an Unanswered short_text skips review and only answered short_text gets `pending`. Verify in the same integration test file with the spec example (S1–S3 single, T1–T2 short_text; S3 absent, T2 `   `): 5 answer rows, S3 and T2 read back as `null` with 0 points and `auto`, T1 `pending`, and `submissions.totalScore` equals the sum of S1 and S2 scores. [after: 2.1]

## 3. Student quiz page

- [x] 3.1 Use the shared rule on the quiz page: `QuizInterface` progress count and `QuestionCard` green answered highlight both call `isAnswered`, so whitespace-only short_text is not counted. Verify manually on `pnpm dev`: typing only spaces into a short_text question leaves the progress count unchanged and the card not highlighted. [after: 1.1]
- [x] 3.2 Make the Submit button always enabled with an unanswered-count warning: in `QuizInterface` remove `validateAnswers` and the `allQuestionsAnswered` gating so the button is disabled only while submitting; the hint reads `還有 N 題未作答，仍可提交` when N > 0; the confirmation dialog adds `還有 N 題未作答，未作答題目以 0 分計` when N > 0; cancelling keeps answers on the page. Verify manually on `pnpm dev`: answer 3 of 5 questions, confirm the hint and dialog text, cancel (answers stay), then submit and reach the success page; the admin answer page shows `未作答` for the 2 unanswered questions and the review list shows only answered short_text. [after: 3.1, 2.2]

## 4. Final checks

- [x] 4.1 Run `pnpm test` and `pnpm lint`; both pass with no new warnings. [after: 3.2]
