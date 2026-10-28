## Problem

`GET /api/admin/quizzes/[id]/scores` returns `earned_score: 0` for every entry of `participants[].answers_detail`, even for questions the student answered correctly (GitHub issue #51). `total_score` is correct. Reproduced on staging: a student whose first question shows 10/10 on the answer detail page gets 0 for all three questions in the API response.

No page in this repo calls the API today — the scores page (`/admin/scores/[quizId]`) queries the database itself and already shows the right per-question scores — so the wrong numbers only reach callers of the API directly.

## Root Cause

In the scores route, answers are grouped into a map keyed by `answers.submissionId`, but the lookup for each participant uses `submission.participant_id` as the key. A submission id never equals a participant id, so every lookup misses and the fallback of 0 is used. The route's submission query does not even select the submission id, so the correct key is not available at the lookup.

## Proposed Solution

- The scores route selects the submission id together with the participant id, and looks up a participant's answers by that submission id — the same way the scores page already does.
- Add a requirement to the `quiz-management` spec (modified capability) stating that the scores API reports each submitted participant's earned score per question, with 0 only for a question that has no answer row.
- Add an integration test for the scores route that fails before the fix.

## Non-Goals

- Merging the duplicated score-loading code of the scores page and the scores API into one shared function; this fix only corrects the key.
- Changing the response shape, ranking, statistics, or the scores page.

## Success Criteria

- For a submitted participant, `answers_detail[].earned_score` equals the stored `answers.earned_score` of that question (e.g. 10 for a correctly answered 10-point question), and is 0 for a question without an answer row.
- The new integration test fails on the current code and passes after the fix.
- `pnpm test` and `pnpm lint` pass.

## Impact

- Affected specs: quiz-management (modified capability)
- Affected code:
  - Modified: src/app/api/admin/quizzes/[id]/scores/route.ts
  - New: src/app/api/admin/quizzes/[id]/scores/__integration__/route.test.ts
  - Removed: none
- No migration, no UI change.
