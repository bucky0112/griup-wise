## 1. Strategy-based label

- [x] 1.1 Write `src/lib/grouping/__unit__/strategy-label.test.ts` from the spec example table and ensure the Vitest include list covers `src/**/__unit__/**/*.test.ts`. Verify: the test fails before the helper exists.
- [x] 1.2 [after: 1.1] Sorting label reflects the grouping strategy: add `sortingLabel(strategy)` in `src/lib/grouping/strategy-label.ts`, select `grouping_runs.strategy` into `run_info` in `src/app/admin/groups/[id]/page.tsx` and in `GET /api/admin/quizzes/[id]/groups` (used to reload after an edit), and render `sortingLabel(run_info.strategy)` in `GroupManagement.tsx`. Verify: the unit test passes and a locally created automatic run shows "排序方式：總分" on `/admin/groups/[quizId]`, also after moving a member (which reloads through the API).

## 2. Wrap-up

- [x] 2.1 [after: 1.2] Run `pnpm test` and `pnpm build`; both exit 0. `pnpm lint` adds no problems compared with the base.
