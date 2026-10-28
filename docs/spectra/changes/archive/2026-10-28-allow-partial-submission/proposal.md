## Why

Students currently cannot submit a quiz until every question has an answer: the submit button stays disabled and the submit API rejects the request with `請完成所有題目後再提交`. A student who cannot answer one question is stuck and loses the whole attempt, so the quiz must accept a submission with unanswered questions and score those questions as 0.

## What Changes

- The student quiz page lets the student submit at any time; the submit button is disabled only while a submission is in flight.
- When questions are unanswered, the confirmation dialog warns `還有 N 題未作答，未作答題目以 0 分計` and the hint under the progress count reads `還有 N 題未作答，仍可提交`.
- One shared rule decides whether a question is answered, used by both the student page and the submit API: single/boolean with no selection, multiple with an empty selection, numeric left empty, and short_text whose content is empty after trimming whitespace all count as unanswered.
- `POST /api/assignments/submit` stops rejecting submissions with missing answers. It stores one answer row per question; an unanswered question is stored with a JSON `null` response and 0 points.
- An unanswered short_text question is stored as auto-scored (0 points) instead of pending review, so it never appears in the admin review list.

## Non-Goals (optional)

(See design.md.)

## Capabilities

### New Capabilities

- `quiz-submission`: how a student submits a quiz, including submitting with unanswered questions and how unanswered questions are stored and scored.

### Modified Capabilities

(none)

## Impact

- Affected specs: new `quiz-submission`
- Affected code:
  - src/components/quiz/QuizInterface.tsx (submit button, confirmation dialog, hint text, answered check)
  - src/components/quiz/QuestionCard.tsx (answered check switches to the shared rule)
  - src/app/api/assignments/submit/route.ts (drop the missing-answer rejection, store unanswered questions)
  - New shared helper under src/lib for the answered rule
- No schema migration: `answers.response` stays `jsonb NOT NULL`; unanswered questions store the JSON value `null`.
- Auto-grouping is unchanged; it keeps ranking by total score, in which unanswered questions contribute 0.
