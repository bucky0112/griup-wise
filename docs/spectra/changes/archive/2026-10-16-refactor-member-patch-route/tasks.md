## 1. Characterise the current route

- [x] 1.1 Write `src/lib/grouping/__integration__/member-patch-route.test.ts` pinning every current response of the members `PATCH` route: move success (200 and the member in the new group, run marked `manual_adjusted`), remove success (200), participant not in the group (400 `該參與者不在此組別中`), participant already in the target group (400 `該參與者已在目標組別中`), another admin (403), replaced group (409). Verify: all tests pass against the current route before any refactor.

## 2. Route on top of the manager

- [x] 2.1 [after: 1.1] Add `removeParticipant` and the `fromGroupId` option of `moveParticipant` in `src/lib/grouping/manager.ts`, and rewrite the members `PATCH` route to call them and map their results to the existing responses. Verify: every test from 1.1 and the existing `grouping-concurrency.test.ts` and `group-edit-ownership.test.ts` route tests pass unchanged; the route file no longer imports `lockQuizForGrouping`, `activeGroupIds` or `groupMembers`.

## 3. Wrap-up

- [x] 3.1 [after: 2.1] Run `pnpm test` and `pnpm build`; both exit 0. `pnpm lint` adds no problems compared with the base.
