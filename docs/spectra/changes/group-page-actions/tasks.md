## 1. CSV export

- [x] 1.1 Admin exports the group list as CSV — per "Build the CSV in a pure module": write `src/lib/grouping/__unit__/group-csv.test.ts` first with the "CSV content" example of the delta spec (BOM, header, member order, empty score, `未分組` rows, quoting and the `'` formula prefix for each of `=`, `+`, `-`, `@`), confirm it fails because `src/lib/grouping/group-csv.ts` does not exist, then add `buildGroupsCsv`. Verify: the new unit tests pass.
- [x] 1.2 [after: 1.1] Per "Pass title and visibility from the server page": `src/app/admin/groups/[id]/page.tsx` passes `quizTitle` and `initialShowGroupPublicly`, and `匯出分組名單` in `GroupManagement` downloads `buildGroupsCsv` output as `<quiz title>-分組名單.csv`, disabled when there are no groups and no ungrouped participants. Verify: `pnpm build` passes and, in a local browser, the downloaded file opens with the expected rows.

## 2. Visibility toggle and edit dialog

- [x] 2.1 [after: 1.2] Admin toggles group visibility from the group management page — the button reads `公開分組` or `取消公開`, the `學生可見` badge follows the server value, the two toasts appear, and failures keep the previous state. Verify: in a local browser, publishing and hiding each change `show_group_publicly` in the database and show the specified toast, button and badge.
- [x] 2.2 [after: 2.1] Admin edits a group's name and notes from the group management page — per "Reuse the batch-move 409 handling for the edit dialog": `編輯組別` opens a prefilled dialog that states saving stops automatic replacement, disables save for a blank name, updates the card on success, and on 409 toasts, closes and reloads. Verify: in a local browser, renaming to `火箭隊` with notes `負責簡報` updates the card and a following qualifying submission reports `Active grouping is admin-managed`; saving after a regroup from another session shows `分組已更新，請重新整理後再操作` and the current groups.

## 3. Wrap-up

- [x] 3.1 [after: 2.2] Run `pnpm test` and `pnpm build`; both exit 0, and `pnpm lint` reports no problems. Record the browser acceptance in this file and close GitHub issue #33 through the PR.

Note on browser acceptance (2026-10-19, local dev server against the local database, quiz 「驗收測驗 #15 公開凍結」):
- 編輯組別 after another session regrouped: saving showed `分組已更新，請重新整理後再操作`, closed the dialog and reloaded to the current 6 members. A name of only spaces disabled 儲存. Renaming 第 1 組 to 火箭隊 with notes 負責簡報 updated the card; the next qualifying submission (cooldown expired by backdating rows, as `expireCooldown` does) reported `Active grouping is admin-managed` and the database kept 火箭隊／負責簡報.
- 公開分組: the button became 取消公開 with the 學生可見 badge and the toast `已公開分組，公開期間自動分組會暫停`, and `show_group_publicly` became true; clicking again restored 公開分組, removed the badge, toasted `已取消公開，自動分組將恢復` and stored false. A 403 injected by stubbing `fetch` showed its message and left the button and badge unchanged.
- 匯出分組名單: the anchor click was intercepted instead of downloading; the file was named `驗收測驗 #15 公開凍結-分組名單.csv`, started with the UTF-8 BOM bytes `EF BB BF`, had the header `組別,學號,姓名,分數` and one row per member in group order. Ungrouped rows and escaping are covered by `group-csv.test.ts`.
