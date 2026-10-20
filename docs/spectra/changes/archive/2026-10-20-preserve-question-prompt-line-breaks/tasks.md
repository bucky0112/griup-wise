## 1. Forms edit multi-line prompts

- [x] 1.1 Question prompt keeps its line breaks in the add-question form: `AddQuestionForm` binds `prompt` to the `Textarea` component instead of `Input`, so an admin can type Enter inside the prompt and the submitted payload contains `\n`. Verify manually in the browser: add a question with a three-line prompt, then check the POST body in the network panel contains the line breaks.
- [x] 1.2 Question prompt keeps its line breaks in the edit-question form: `EditQuestionForm` binds `prompt` to `Textarea`, so opening a multi-line question shows every line and saving after changing only the score leaves the stored prompt identical. Verify manually in the browser using the "prompt round trip" example in the spec: compare the prompt returned by the questions API before and after the save.

## 2. Admin pages render prompt line breaks

- [x] 2.1 The admin question list page (`src/app/admin/quizzes/[id]/questions/page.tsx`, the prompt paragraph inside each question card) renders the prompt with `whitespace-pre-wrap`, so a multi-line prompt appears on separate lines. Verify manually in the browser with the question from 1.1.
- [x] 2.2 The admin participant answer page (`src/app/admin/answers/[quizId]/[participantId]/page.tsx`, the prompt paragraph inside each answer card) renders the prompt with `whitespace-pre-wrap`. Verify manually in the browser on a participant who answered the question from 1.1.

## 3. Regression gate

- [x] 3.1 The full test suite and lint pass with no new warnings. Verify with `npm test` and `npm run lint` (or `make test` if a Makefile exists).
- [x] 3.2 Question prompt keeps its line breaks through the questions API: an integration test in `src/app/api/quizzes/[id]/questions/__integration__/route.test.ts` creates a question via `POST` with a multi-line prompt and checks the stored prompt is unchanged, then sends a `PUT` that changes only the score from 5 to 10 (the "prompt round trip" example) and checks the stored prompt is still identical. Verify with `npx vitest run src/app/api/quizzes`.
