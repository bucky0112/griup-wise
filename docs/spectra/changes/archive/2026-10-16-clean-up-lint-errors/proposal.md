## Why

`pnpm lint` fails on `main` with 19 errors and 24 warnings (GitHub issue #8), so lint cannot be a completion check and every change has to be compared against a baseline by hand. The four Jest test files under `src/lib/grouping/__tests__` cannot run (Jest is not installed) and are excluded from `tsconfig.json`, yet still produce lint errors.

## What Changes

- Replace the 16 `no-explicit-any` uses with concrete types or `unknown` plus narrowing, in the answer-review page, the review batch route, the student quiz page, `EditQuestionForm`, `ReviewSubmissions`, `QuestionCard` and `src/lib/db/index.ts`, without changing behaviour.
- Fix the `react-hooks/set-state-in-effect` error in `src/components/ui/sonner.tsx`.
- Remove the 23 unused variables and imports reported in `src/` (the remaining warning comes from the remember plugin's `.remember/` folder, which is added to the ESLint ignore list).
- Port `config.test.ts`, `distribution.test.ts` and `ranking.test.ts` (pure functions, no Jest mocks) to Vitest under `src/lib/grouping/__unit__/` so they run in `pnpm test`, and delete `triggers.test.ts`, whose 14 Jest mocks target the pre-PR #9 event and cooldown internals now covered by `src/lib/grouping/__integration__`. Then drop the `__tests__` exclusion from `tsconfig.json`.

## Non-Goals (optional)

- Adding lint to CI or a pre-commit hook.
- Refactoring beyond what a lint rule requires.
- Raising or relaxing any ESLint rule.

## Impact

- Affected specs: none
- Affected code:
  - Modified: eslint.config.mjs, tsconfig.json, vitest.config.ts, src/app/admin/answers/[quizId]/[participantId]/page.tsx, src/app/api/admin/reviews/batch/route.ts, src/app/quiz/page.tsx, src/components/admin/EditQuestionForm.tsx, src/components/admin/ReviewSubmissions.tsx, src/components/quiz/QuestionCard.tsx, src/lib/db/index.ts, src/components/ui/sonner.tsx, src/app/admin/groups/[id]/page.tsx, src/app/api/admin/groups/[groupId]/members/move/route.ts, src/app/api/admin/reviews/answer/[answerId]/route.ts, src/app/api/admin/reviews/pending/route.ts, src/app/api/assignments/submit/route.ts, src/lib/grouping/config.ts, src/lib/grouping/triggers.ts
  - New: src/lib/grouping/__unit__/config.test.ts, src/lib/grouping/__unit__/distribution.test.ts, src/lib/grouping/__unit__/ranking.test.ts
  - Removed: src/lib/grouping/__tests__/config.test.ts, src/lib/grouping/__tests__/distribution.test.ts, src/lib/grouping/__tests__/ranking.test.ts, src/lib/grouping/__tests__/triggers.test.ts
