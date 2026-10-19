## Problem

The group management page (`/admin/groups/[id]`) shows `分組時間` under its title. When the page reloads the groups without a full navigation — after a 409 from 編輯組別 or batch move, after 重新分組, or after automatic grouping replaced the run — the groups and members update but `分組時間` keeps showing the replaced run's creation time until the browser reloads the page (GitHub issue #37).

## Root Cause

`分組時間` is rendered by the server page `src/app/admin/groups/[id]/page.tsx` from the `groupsData` it loaded once, while every later reload goes through `refreshData()` in `GroupManagement`, which only updates the component's own `data` state. The server page also formats the time with `toLocaleString('zh-TW')` without a time zone, so the shown time depends on the server's time zone.

## Proposed Solution

- Show `分組時間` inside `GroupManagement`, as the first item of the 分組配置 card, read from `data.run_info.created_at`, so it updates whenever `refreshData()` loads a new run.
- Remove the line under the page title.
- Format the time with a pure helper that always uses the `Asia/Taipei` time zone, so server rendering and browser hydration produce the same text regardless of where the server runs.

## Non-Goals

- No `router.refresh()`; the server page is not re-rendered after client reloads.
- No change to the overview page `/admin/groups` or to any API.

## Success Criteria

- After a reload that replaces the active run, the 分組配置 card shows the new run's creation time without a browser reload.
- The time text is identical on server and client for the same run (no hydration mismatch), formatted in Taipei time.
- `pnpm test`, `pnpm build` and `pnpm lint` pass.

## Impact

- Affected specs: group-management-page (new requirement "Grouping time follows the displayed run")
- Affected code:
  - Modified: src/components/admin/GroupManagement.tsx, src/app/admin/groups/[id]/page.tsx
  - New: src/lib/grouping/grouping-time.ts, src/lib/grouping/__unit__/grouping-time.test.ts
  - Removed: none
