## Context

The student quiz page (`QuizInterface`) blocks submission until every question is answered: the submit button is disabled while any question is unanswered, `validateAnswers` shows a toast and scrolls to the first missing question, and `handleSubmit` checks again before the confirmation dialog. The submit API (`POST /api/assignments/submit`) rejects the request with HTTP 400 `請完成所有題目後再提交` when any question id is missing from the `answers` body.

The "answered" rule is duplicated and inconsistent today:
- `QuizInterface.isQuestionAnswered` treats a short_text object `{ type: 'text_response', content: '' }` as answered, because the fallback check only rejects `undefined`, `null` and `''`.
- `QuestionCard.isAnswered` trims the short_text `content` and treats whitespace-only content as unanswered.
- The API only checks `questionId in answers`, so a cleared selection (`''` or `[]`) already passes.

Storage constraint: `answers.response` is `jsonb NOT NULL`. drizzle-orm converts a JS `null` parameter to SQL `NULL` without calling the jsonb encoder (`node_modules/drizzle-orm/sql/sql.js`, Param handling), so inserting `response: null` would violate the constraint. The admin answer page (`formatStudentResponse`) already renders a `null` response as `未作答`, and `calculateScore` already returns 0 for `null`/`undefined`.

## Goals / Non-Goals

**Goals:**

- A student can submit a quiz with any number of unanswered questions, including zero answered questions.
- The student page and the submit API use one shared rule for "answered".
- Every question in the quiz gets exactly one answer row; unanswered questions score 0 and never enter manual review.

**Non-Goals:**

- No change to auto-grouping or manual grouping; both keep ranking by `submissions.totalScore`.
- No time limit or auto-submit when time runs out.
- No schema migration; `answers.response` stays `jsonb NOT NULL`.
- No change to the admin answer page or review list UI; they already handle a `null` response and filter by `reviewStatus = 'pending'`.
- No replacement of `window.confirm` with a custom dialog component.

## Decisions

### Shared isAnswered helper in src/lib

Add `isAnswered(questionType, response): boolean` in a new module `src/lib/answered.ts`, used by `QuizInterface`, `QuestionCard` and the submit API. Rules:

| Question type | Unanswered when |
| --- | --- |
| single | `undefined`, `null`, or `''` |
| boolean | `undefined`, `null`, or `''` (`false` is answered) |
| numeric | `undefined`, `null`, or `''` (`0` is answered) |
| multiple | not an array, or an empty array |
| short_text | string trimmed to `''`; object whose `content` is missing or trims to `''`; `undefined`/`null` |

Alternative considered: keep separate checks in each component and only relax the API. Rejected because the current checks already disagree on short_text, and the API must use the same rule to decide what to store as unanswered.

### Store unanswered questions as JSON null

The submit API normalizes each question's response: if `isAnswered` returns false, the stored `response` is the JSON value `null` written as `sql\`'null'::jsonb\``, `earnedScore` is `'0'`, and `reviewStatus` is `'auto'`. This applies to every question type, including short_text.

Alternatives considered:
- Skip the answer row for unanswered questions. Rejected: admin pages and review counts assume one row per question; a missing row would render as absent rather than `未作答`.
- Make `response` nullable. Rejected: needs a migration, and JSON `null` already reads back as JS `null`, which the admin page handles.
- Store the raw cleared value (`''`, `[]`, `{content: '  '}`). Rejected: the admin page would show `未選擇` or blank instead of `未作答`, and short_text would still need special casing to avoid review.

### Unanswered short_text skips review

Only an answered short_text question gets `reviewStatus: 'pending'`. An unanswered one is stored as auto-scored 0, so the admin review list (which lists pending answers) never shows it.

### Submit button always enabled with an unanswered-count warning

Remove the `allQuestionsAnswered` gating from the button, `validateAnswers`, and the second check in `handleSubmit`. The confirmation dialog keeps its current lines and, when N > 0 questions are unanswered, adds `還有 N 題未作答，未作答題目以 0 分計`. The hint under the progress count shows `還有 N 題未作答，仍可提交` when N > 0 and keeps the existing all-done message when N = 0. Cancelling the dialog keeps the student on the page with answers unchanged.

## Implementation Contract

**Behavior**
- Student page: the submit button is enabled whenever no submission is in flight. Clicking it opens the confirmation dialog directly (no toast, no blocking).
- Dialog text with N unanswered (N > 0) contains `還有 N 題未作答，未作答題目以 0 分計`; with N = 0 it does not contain that line.
- Hint text: N > 0 → `還有 N 題未作答，仍可提交`; N = 0 → `✓ 所有題目已完成，請檢查您的答案後點擊提交按鈕` (unchanged).
- Progress count and the green "answered" card highlight use `isAnswered`, so whitespace-only short_text is not counted as answered.

**Interface / data shape**
- `isAnswered(questionType: Question['type'] | string, response: unknown): boolean` exported from `src/lib/answered.ts`.
- `POST /api/assignments/submit` body is unchanged (`{ answers: Record<questionId, unknown> }`); questions may be absent or hold empty values.
- For each quiz question the API inserts one `answers` row:
  - answered → `response` = submitted value, scoring unchanged (`calculateScore` for auto types, `pending` + 0 for short_text)
  - unanswered → `response` = JSON `null`, `earnedScore` = `'0'`, `reviewStatus` = `'auto'`
- `submissions.totalScore` = sum of auto-scored `earnedScore`, as today.

**Failure modes**
- The `請完成所有題目後再提交` 400 response is removed. All other rejections stay: unauthenticated (401), inactive quiz (400), already submitted (400), quiz with no questions (400), malformed body (400 zod).

**Acceptance criteria**
- Unit tests for `isAnswered` cover every row of the rule table, including `false`, `0`, `[]`, `'   '`, and `{ type: 'text_response', content: '  ' }`.
- An integration test of the submit route with the 5-question example from the spec (3 single, 2 short_text; 2 single + 1 short_text answered, 1 short_text whitespace-only, 1 single absent) returns 200 and stores 5 answer rows, 2 with JSON `null` response, 0 points and `auto`, and exactly 1 `pending` row.
- An integration test submitting `{ answers: {} }` returns 200 with total score 0.
- `pnpm test` and `pnpm lint` pass.

**Scope**
- In: `src/lib/answered.ts` (new), `QuizInterface`, `QuestionCard`, the submit route, and their tests.
- Out: grouping, admin pages, schema, quiz timing.

## Risks / Trade-offs

- [Students submit by accident with many unanswered questions] → The confirmation dialog states the unanswered count and the 0-point consequence before submitting.
- [Inserting JS `null` into `answers.response` fails with a NOT NULL violation] → Write unanswered responses as `sql\`'null'::jsonb\``; the integration test asserts the stored value reads back as `null`.
- [An answered short_text whose content is only whitespace previously went to review; it now scores 0 without review] → Intended per the agreed definition of unanswered.
