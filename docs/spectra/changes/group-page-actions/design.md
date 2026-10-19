## Context

`GroupManagement` (`src/components/admin/GroupManagement.tsx`) is the client component of `/admin/groups/[id]`. It receives `quizId`, `defaultGroupSize` and `initialData` (active run, groups with members, ungrouped participants) from the server page `src/app/admin/groups/[id]/page.tsx`, reloads with `refreshData()` (`GET /api/admin/quizzes/[id]/groups`), and reports results with `sonner` toasts. Existing dialogs use `@/components/ui/dialog`; the batch-move flow already handles 409 by toasting the message, closing the dialog and calling `refreshData()`. The page does not pass the quiz title or `show_group_publicly` to the component today. Both APIs the buttons need exist: `PATCH /api/admin/quizzes/[id]` (owner-only, returns the updated `show_group_publicly`) and `PATCH /api/admin/groups/[groupId]` (owner-only, 409 for groups outside the active run, marks the run admin-managed). The test suite runs in Node without a DOM, so components are not unit-tested in this repo.

## Goals / Non-Goals

**Goals:**

- Make 公開分組, 編輯組別 and 匯出分組名單 do what their labels say, using existing APIs.

**Non-Goals:**

- Editing group order, server-side export, new API routes, or adding a DOM test environment.

## Decisions

### Pass title and visibility from the server page

The page already loads the quiz; it adds `title` and `showGroupPublicly` to what it passes, and `GroupManagement` gains `quizTitle` and `initialShowGroupPublicly` props. The component keeps visibility in state and replaces it with the `show_group_publicly` value in the PATCH response, so the UI never shows a value the server did not confirm. Alternative: fetch visibility on mount; rejected because the server page already has it and a fetch adds a loading state.

### Build the CSV in a pure module

`buildGroupsCsv(groups, ungrouped): string` lives in `src/lib/grouping/group-csv.ts` and returns the CSV text with a leading BOM; the component only wraps it in a `Blob` and triggers the download. Keeping the formatting pure makes the escaping and formula-prefix rules unit-testable in the existing Node test setup. Formula prefixing is needed because display names are typed by students. Alternative: a server export route; rejected because the page already holds exactly the rows to export.

### Reuse the batch-move 409 handling for the edit dialog

The edit dialog follows the same failure handling as the batch-move dialog: 409 → toast the message, close, `refreshData()`; other failures → toast and keep the dialog open. On success the component updates the edited group in local state from the response `group`, avoiding a full reload.

## Implementation Contract

- **Behavior**: as specified in the group-management-page delta spec — visibility toggle with `公開分組`/`取消公開`, badge `學生可見` and the two toasts; edit dialog with required name (≤100) and notes (≤500), a note that saving stops automatic replacement, 409 handling; CSV download `<quiz title>-分組名單.csv` with header `組別,學號,姓名,分數`.
- **Interface**: `GroupManagement` props add `quizTitle: string` and `initialShowGroupPublicly: boolean`; `buildGroupsCsv(groups: { name: string; members: { student_no: string; display_name: string; total_score: number | null }[] }[], ungrouped: { student_no: string; display_name: string }[]): string`.
- **Failure modes**: non-2xx responses show the server `message` (fallback `操作失敗，請稍後再試`) and leave visibility state or dialog input unchanged; a network error behaves the same.
- **Acceptance**: `src/lib/grouping/__unit__/group-csv.test.ts` covers the CSV example and escaping; UI behavior is accepted in a local browser on `/admin/groups/[id]` for every scenario of the delta spec; `pnpm test`, `pnpm build` and `pnpm lint` pass.
- **Scope**: in scope — the component, the page props, the CSV module and its test. Out of scope — API routes, the student group view, and the other dead UI paths not named in issue #33.

## Risks / Trade-offs

- [UI behavior has no automated test] → The logic with branching rules (CSV) is unit-tested; the button wiring is verified in the browser and the APIs keep their integration tests.
- [Excel may still mangle long student numbers as numbers] → Out of scope; the CSV keeps the raw text and teachers can import it as text.
