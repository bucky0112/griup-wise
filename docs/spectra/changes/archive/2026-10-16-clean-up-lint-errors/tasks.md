## 1. Grouping unit tests

- [x] 1.1 Port `src/lib/grouping/__tests__/config.test.ts`, `distribution.test.ts` and `ranking.test.ts` to Vitest under `src/lib/grouping/__unit__/` (swap `@jest/globals` imports for `vitest`), add `src/**/__unit__/**/*.test.ts` to the Vitest include list if missing, delete the four `__tests__` files including `triggers.test.ts`, and remove the `__tests__` entry from `tsconfig.json`'s `exclude`. Verify: `pnpm test` runs the three ported files and passes; any ported assertion that fails against current behaviour is reported before being changed, not silently edited.

## 2. Lint errors and warnings

- [x] 2.1 [after: 1.1] Replace the `no-explicit-any` uses and fix `react-hooks/set-state-in-effect` in `src/components/ui/sonner.tsx` without changing behaviour. Verify: `pnpm lint` reports 0 errors, `pnpm build` succeeds, and `pnpm test` passes.
- [x] 2.2 [after: 2.1] Remove the unused variables and imports in `src/` and add `.remember/**` to the ESLint ignores. Verify: `pnpm lint` exits 0 with no warnings and `pnpm build` succeeds.

## 3. Wrap-up

- [x] 3.1 [after: 2.2] Smoke-check locally with `pnpm start`: admin login, answer review page, student quiz page and a review batch request still work. Verify: each page responds 200 and the server log has no errors.

Note on 1.1 (2026-10-16): five ported assertions failed against current behaviour. Two expectations were stale since commit `afaebf5` changed the distribution (7 participants in 3 groups snake to [1,6,7]; group sizes no longer exceed `target_group_size`, so 5 with size 4 split 3+2) and were updated to the current behaviour. Three came from `validateDistribution`, which no production code calls and whose snake-pattern check no longer matched the distribution; with the user's approval it was deleted together with `isSnakePatternValid`, `calculateExpectedRankIndex` and its tests.
