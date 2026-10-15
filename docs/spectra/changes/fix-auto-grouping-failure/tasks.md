## 1. Test tooling

- [x] 1.1 Per "Vitest with a dedicated test database": add `vitest` as a dev dependency, a `test` script running `vitest run`, and `vitest.config.ts` collecting only `src/**/__integration__/**/*.test.ts`, with a global setup in `src/test/db.ts` that points `DATABASE_URL` at `TEST_DATABASE_URL` (default `postgresql://localhost:5432/group_wise_test`), refuses to run when it equals the `.env.local` `DATABASE_URL`, applies `src/lib/db/migrations`, and exposes a table-truncation helper. Verify: a placeholder integration test that inserts and reads an `admins` row passes under `pnpm test`, and running with `TEST_DATABASE_URL` set to the dev URL fails with the refusal message.

## 2. Failing tests first

- [x] 2.1 [after: 1.1] In `src/lib/grouping/__integration__/auto-grouping.test.ts`, write one test per scenario in `specs/auto-grouping/spec.md` (Automatic grouping run attribution, Cooldown only after a successful automatic grouping, Automatic grouping preserves admin-owned groups), seeding admin, class, quiz, participants and submissions directly and calling `groupingManager.autoGroup` the way the submit route does. Verify: `pnpm test` shows the attribution test failing on the `grouping_runs` foreign-key insert error and the cooldown-retry test failing with the cooldown reason, before any production change.

## 3. Attribution and cooldown fix

- [x] 3.1 [after: 2.1] Per "Attribute automatic runs to the quiz owner": `autoGroup` resolves `quizzes.created_by` and passes it to `performGrouping`, which writes `config.trigger = "automatic"` only for automatic runs while `manualGroup` keeps writing no `trigger`. Verify: the "Third submission creates an automatic run" test passes and the run's `created_by` equals the seeded admin id.
- [x] 3.2 [after: 3.1] Per "Record the trigger event after the attempt": `autoGroup` records its `grouping_events` row after the attempt with `trigger_metadata.grouping_status` set to `succeeded` or `failed`, rethrowing on failure, and `isInCooldownPeriod` ignores events whose status is `failed` or `skipped_admin_managed`. Verify: "Failed attempt does not start cooldown" (forced failure by making the private `performGrouping` reject once via `vi.spyOn`; deleting the owner admin is impossible because `quizzes.created_by` references `admins` without cascade) and "Successful attempt starts cooldown" both pass.

## 4. Admin-managed protection

- [x] 4.1 [after: 3.2] Automatic grouping preserves admin-owned groups — per "Mark admin ownership in the run config": before grouping, `autoGroup` reads the active run and, when its `config.trigger` is not `"automatic"`, records `grouping_status: "skipped_admin_managed"` and returns `success: false` with reason `Active grouping is admin-managed`. Verify: "Manually created run is kept" passes with the run seeded through `groupingManager.manualGroup`, asserting run id, group ids and member rows are unchanged.
- [x] 4.2 [after: 4.1] Add `markRunAdminManaged(tx, groupId)` in `src/lib/grouping/manager.ts` and call it inside the transactions of `moveParticipant`, `swapParticipants`, `batchMove` and the `PATCH` handler in `src/app/api/admin/groups/[groupId]/members/route.ts`, so any membership edit turns an automatic run's `config.trigger` into `"manual_adjusted"`. Verify: "Adjusted automatic run is kept" passes using `groupingManager.moveParticipant`, a separate test asserts the `PATCH` handler path sets `manual_adjusted`, and "Unadjusted automatic run is refreshed" passes with the cooldown event backdated by 6 minutes.

## 5. Wrap-up

- [x] 5.1 [after: 4.2] Run `pnpm test` and `pnpm build`; both exit 0. Run `pnpm lint` and confirm this change adds no lint problems compared with the base commit (the base already has 20 errors and 27 warnings, tracked in GitHub issue #8), so `pnpm lint` is not required to exit 0.
- [ ] 5.2 [after: 5.1] Manual acceptance on staging after deploy: create a fresh quiz, submit as 3 students, confirm `/admin/groups/[quizId]` shows groups and the third submit response has `autoGrouping.triggered = true`; then move one member, submit a 4th student after 5 minutes, and confirm the groups are unchanged. Record the result in the PR description, which closes GitHub issue #2.
