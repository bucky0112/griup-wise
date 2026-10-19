## Context

`authenticateStudent(displayName, studentNo, quizId)` in `src/lib/auth.ts` returns `StudentSession | null`; `null` means the quiz is missing or inactive and `POST /api/auth/student` turns it into 401. It finds an existing participant by `(quiz_id, student_no)` and otherwise inserts one. The `participants` table has unique constraints on `(quiz_id, student_no)` and on `unique_key`. The login page (`src/app/quiz/[quizId]/login/page.tsx`) shows the response `message` as a toast for any non-OK status. The only other caller is the "lets a student log in and submit while a grouping operation holds the quiz lock" test in `src/lib/grouping/__integration__/grouping-concurrency.test.ts`.

## Goals / Non-Goals

**Goals:**

- Stop a different name from taking over an existing participant in the same quiz.
- Give the student an actionable message instead of a silent takeover or a 500.

**Non-Goals:**

- Teacher tools to rename participants or release student numbers.
- Changing student-number normalization, admin login, or the login page UI.
- Fuzzy name matching (internal whitespace, traditional/simplified variants).

## Decisions

### Return a discriminated result from authenticateStudent

`authenticateStudent` returns `{ ok: true, session } | { ok: false, reason: 'quiz_unavailable' | 'name_mismatch' }`. The route maps `quiz_unavailable` to 401 (existing message) and `name_mismatch` to 409. Alternative considered: keep `StudentSession | null` and throw a `StudentNameMismatchError`; rejected because a name mismatch is an expected outcome, and `null` already hides which failure happened. The one test caller is updated to read `result.ok` / `result.session`.

### Compare names after trim and lowercase

`normalizeDisplayName(name) = name.trim().toLowerCase()`. Trim covers accidental spaces and lowercase covers English names typed in different case; Chinese names are unaffected by lowercasing. Internal whitespace is not collapsed, so `Amy  Chen` and `Amy Chen` differ — keeping the rule easy to explain in the error message.

### Insert with ON CONFLICT DO NOTHING, then re-read

The first-login insert uses `onConflictDoNothing({ target: [participants.quizId, participants.studentNo] })`. When it returns no row, another login inserted the same student number first; the function re-reads that participant and applies the name check. Alternative: catch the unique-violation error code; rejected because it couples to driver error shapes and still needs the re-read. No lock is taken, so student login keeps not waiting on the grouping lock (auto-grouping spec, "Students keep working during a grouping operation").

## Implementation Contract

- **Behavior**: existing student number + matching name → 200 as today; existing student number + different name → 409 `此學號已由其他姓名登入，請確認姓名與學號，或洽詢老師`, no cookie, no participant change; missing or inactive quiz → 401 as today; concurrent first logins with one student number → one participant, the loser gets 200 or 409 by the name rule.
- **Interface**: `authenticateStudent(displayName: string, studentNo: string, quizId: string): Promise<StudentLoginResult>` where `StudentLoginResult = { ok: true; session: StudentSession } | { ok: false; reason: 'quiz_unavailable' | 'name_mismatch' }`, exported from `src/lib/auth.ts`.
- **Failure modes**: database errors still propagate and the route returns its existing 500; the stored display name is never overwritten by a login.
- **Acceptance**: new tests in `src/app/api/auth/student/__integration__/route.test.ts` cover every scenario of the authentication delta spec by calling the route `POST` handler with `createSession` mocked; `pnpm test` passes including the updated grouping-concurrency login test.
- **Scope**: in scope — `src/lib/auth.ts`, `src/app/api/auth/student/route.ts`, the test caller update and the new test file. Out of scope — UI, schema, admin auth.

## Risks / Trade-offs

- [A student who mistyped their name on first login is locked out of their own record] → The message tells them to contact the teacher; teacher-side rename is a possible follow-up, not part of this change.
- [Two real students share a student number by mistake] → The second one now gets 409 instead of silently sharing a record, which surfaces the data problem to the teacher.
