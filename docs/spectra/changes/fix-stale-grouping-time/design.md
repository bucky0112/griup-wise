## Context

`/admin/groups/[id]` is a server page (`src/app/admin/groups/[id]/page.tsx`) that loads the active run and groups once and renders `分組時間：{new Date(run_info.created_at).toLocaleString('zh-TW')}` under its title. The client component `GroupManagement` (`src/components/admin/GroupManagement.tsx`) receives that data as `initialData`, keeps it in `data` state, and replaces it through `refreshData()` after regroups and 409 rejections. Its 分組配置 card already renders from `data.run_info` (目標人數, 排序方式, 未交卷者, 狀態). The test suite runs in Node without a DOM.

## Goals / Non-Goals

**Goals:**

- `分組時間` always matches the run whose groups are shown.
- The shown time does not depend on the server's time zone and hydrates without mismatch.

**Non-Goals:**

- Re-rendering the server page after client reloads, changing `/admin/groups`, or touching APIs.

## Decisions

### Render the time from the component's run data

The time moves into the 分組配置 card as its first item, read from `data.run_info.created_at`, so the single `data` state drives both the groups and their time. Alternative: call `router.refresh()` after `refreshData()`; rejected because it re-runs the page's database queries on every reload while the component already holds the new run.

### Format in Asia/Taipei through a pure helper

`formatGroupingTime(createdAt: string): string` in `src/lib/grouping/grouping-time.ts` takes the parts of an `Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour12: true, ... })` and assembles `<year>/<month>/<day> <dayPeriod><hour>:<minute>:<second>` itself. A fixed zone keeps a server in UTC and a browser in Taiwan from disagreeing; assembling the string keeps ICU differences out of it, because `toLocaleString` output depends on the ICU version (Node 24 with ICU 78 separates date and time with U+2009, which other runtimes may not), and either difference would make React report a hydration mismatch. The helper is unit-tested with the spec example.

## Implementation Contract

- **Behavior**: the 分組配置 card's first item reads `分組時間：<formatted time>` for the shown run and updates after `refreshData()`; the title area no longer shows it; no active run means no `分組時間` anywhere.
- **Interface**: `formatGroupingTime(createdAt: string): string`, exported from `src/lib/grouping/grouping-time.ts`.
- **Failure modes**: none new; an invalid date string would render `Invalid Date` as today.
- **Acceptance**: `src/lib/grouping/__unit__/grouping-time.test.ts` covers both example rows; local browser check that after a 409 reload the card shows the new run's time and the title area shows none, with no hydration warning in the console; `pnpm test`, `pnpm build`, `pnpm lint` pass.
- **Scope**: in scope — the helper and its test, the 分組配置 card, removing the title line. Out of scope — other pages and APIs.

## Risks / Trade-offs

- [Admins outside Taiwan see Taipei time] → The product is used by Taiwanese classes and labels are Traditional Chinese; a fixed zone is preferred over a mismatch-prone server/browser difference.
