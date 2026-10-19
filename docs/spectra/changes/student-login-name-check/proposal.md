## Problem

A student logs in to a quiz with a display name and a student number. When a participant with that student number already exists in the quiz, `authenticateStudent` logs the new visitor in as that existing participant even if the display name is different. Anyone who types a classmate's student number takes over that classmate's identity, answers and group membership (GitHub issue #7).

## Root Cause

`authenticateStudent` in `src/lib/auth.ts` looks up the participant by `(quiz_id, student_no)` only and never compares the stored `display_name` with the submitted one. It also inserts a new participant without handling the `participants_quiz_student_unique` constraint, so two first logins with the same student number at the same moment make the second one fail with HTTP 500.

## Proposed Solution

- When a participant with the same student number exists in the quiz and the submitted display name does not match the stored one, reject the login with HTTP 409 and the message `此學號已由其他姓名登入，請確認姓名與學號，或洽詢老師`. Names match when they are equal after trimming surrounding whitespace and ignoring letter case.
- A matching name keeps today's behavior: the student logs in as the existing participant.
- Make the first-login insert tolerate a concurrent insert of the same student number: on conflict, re-read the existing participant and apply the same name check, so the result is either a login or the 409, never a 500.
- `authenticateStudent` returns an explicit result that tells "quiz unavailable" apart from "name mismatch", and `POST /api/auth/student` maps them to 401 and 409. The login page already shows the response `message` as a toast, so no UI change is needed.

## Non-Goals

- No way for a teacher to rename a participant or release a student number; a student who mistyped their name on first login asks the teacher, as the message says.
- No change to student-number normalization (trim + uppercase) or to admin login.
- No fuzzy name matching beyond trim and letter case.

## Success Criteria

- Logging in with an existing student number and a different name returns 409 with the message above and creates no participant and no session.
- Logging in with an existing student number and the same name (different case or surrounding spaces allowed) logs in as the existing participant.
- Two concurrent first logins with the same student number and different names produce one participant, one 200 and one 409.
- `pnpm test` passes, including the existing "lets a student log in and submit while a grouping operation holds the quiz lock" test.

## Impact

- Affected specs: authentication (new requirement "Student login matches name and student number")
- Affected code:
  - Modified: src/lib/auth.ts, src/app/api/auth/student/route.ts, src/lib/grouping/__integration__/grouping-concurrency.test.ts
  - New: src/app/api/auth/student/__integration__/route.test.ts
  - Removed: none
- No migration; the existing unique constraint on `(quiz_id, student_no)` is reused.
