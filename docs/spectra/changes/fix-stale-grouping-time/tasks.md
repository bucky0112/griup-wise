## 1. Time formatting

- [x] 1.1 Per "Format in Asia/Taipei through a pure helper": write `src/lib/grouping/__unit__/grouping-time.test.ts` with both rows of the "formatted times" example of the spec, confirm it fails because `src/lib/grouping/grouping-time.ts` does not exist, then add `formatGroupingTime`. Verify: the new unit tests pass.

## 2. Show the time with the displayed run

- [x] 2.1 [after: 1.1] Grouping time follows the displayed run — per "Render the time from the component's run data": the 分組配置 card in `GroupManagement` shows `分組時間：` with `formatGroupingTime(data.run_info.created_at)` as its first item, and the line under the title in `src/app/admin/groups/[id]/page.tsx` is removed. Verify: in a local browser, after another session regroups and a 編輯組別 save returns 409, the card shows the new run's creation time (matching `grouping_runs.created_at` in Taipei time), the title area shows no `分組時間`, and the console has no hydration warning.

## 3. Wrap-up

- [x] 3.1 [after: 2.1] Run `pnpm test` and `pnpm build`; both exit 0, and `pnpm lint` reports no problems. Record the browser check in this file and close GitHub issue #37 through the PR.

Note on browser acceptance (2026-10-19, local dev server against the local database): the page of a quiz with run R1 (created 13:25:48 Taipei) showed `分組時間：2026/10/19 下午1:25:48` as the first item of the 分組配置 card and nothing under the title. Another session then regrouped into R2 (13:32:13); saving 編輯組別 on the open page returned 409, and after the reload the only `分組時間` on the page read `2026/10/19 下午1:32:13` with 4 members. The only hydration warning in the Next.js overlay was the `trancy-version` attribute a browser translation extension adds to `<html>`, not the grouping time. The `formatGroupingTime` unit tests also pass with the machine time zone set to UTC and America/New_York.
