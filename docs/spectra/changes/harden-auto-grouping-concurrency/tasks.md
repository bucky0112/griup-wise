## 1. Failing concurrency tests

- [x] 1.1 In `src/lib/grouping/__integration__/grouping-concurrency.test.ts`, write one test per scenario of `specs/auto-grouping/spec.md` in this change (Grouping changes for a quiz are serialized, Concurrent submissions regroup at most once per cooldown, Admin member edits on replaced groups are rejected, Admin-managed quizzes skip automatic grouping cheaply), driving real concurrent transactions with `Promise.all` and repeating each concurrent scenario 10 times; the stale-edit scenarios call `/api/admin/groups/move-participant` and the members `PATCH` route with a mocked admin session. Verify: before production changes, `pnpm test` fails the burst scenario (more than one run created), the stale-edit scenarios (400/500 or a false success instead of 409) and the cheap-skip scenario (hashes recorded); record which concurrent scenarios happened to pass, since interleavings vary.

## 2. Serialize grouping changes

- [x] 2.1 [after: 1.1] Grouping changes for a quiz are serialized — per "Serialize grouping changes with a quiz row lock": add `lockQuizForGrouping` in `src/lib/grouping/quiz-lock.ts` and call it first in `performGrouping` (replacing the active-run `FOR UPDATE`), in the create route and in the regenerate route. Verify: "First grouping triggered by simultaneous submissions" passes 10/10 with one active run and no `failed` event, and a test asserts a student login (`POST /api/auth/student`) completes while another connection holds the quiz lock.
- [x] 2.2 [after: 2.1] Concurrent submissions regroup at most once per cooldown — per "Check the cooldown again under the lock": add the in-transaction automatic-run cooldown check with `skipped_cooldown` events, and change `isInCooldownPeriod` to count only `succeeded` or status-less events. Verify: "Burst of submissions after the threshold" passes 10/10 with exactly one run and four cooldown reasons, and all tests in `auto-grouping.test.ts` still pass.

## 3. Admin edits under the lock

- [x] 3.1 [after: 2.2] Admin member edits on replaced groups are rejected — per "Validate edits against the active run under the lock": `moveParticipant`, `swapParticipants`, `batchMove` and the members `PATCH` route take the quiz lock first, validate groups and memberships against the active run inside the transaction, and return `reason: 'stale_grouping'`; the five manager-based routes map that reason to 409. Verify: "Automatic regroup and admin edit run at the same time" passes 10/10 with no 40P01, and both stale-edit scenarios return 409 `分組已更新，請重新整理後再操作` with members unchanged.
- [x] 3.2 [after: 3.1] Admin-managed quizzes skip automatic grouping cheaply — per "Early admin-managed skip in autoGroup": read the active run before `evaluateSubmissionTrigger` and record a `skipped_admin_managed` event without hashes. Verify: "Submission on an admin-managed quiz" passes and the existing admin-managed tests in `auto-grouping.test.ts` still pass.

## 4. Spec and wrap-up

- [x] 4.1 [after: 3.2] Run `pnpm test` and `pnpm build`; both exit 0. Run `pnpm lint` and confirm no problems are added compared with the branch base (GitHub issue #8 tracks the existing ones).
- [ ] 4.2 [after: 4.1] Staging acceptance on the Railway `staging` environment after `railway up` of `fix/auto-grouping-failure`: a burst of 5 concurrent curl submissions on a fresh quiz past the threshold creates one regroup with four cooldown reasons; moving a participant from `/admin/groups/[quizId]` after a regroup triggered from another session shows the 409 message as a toast. Record the result in PR #9.
