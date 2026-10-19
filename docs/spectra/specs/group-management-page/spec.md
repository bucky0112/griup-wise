# group-management-page Specification

## Purpose

The group management page shows an admin the active grouping of a quiz, including how it was configured.

## Requirements

### Requirement: Sorting label reflects the grouping strategy

The group management page SHALL show the sorting label derived from the grouping run's `strategy`, independent of which keys the run's `config` contains.

#### Scenario: Run created by automatic grouping

- **WHEN** the active run was created by automatic grouping or the "自訂分組設定" dialog
- **THEN** the page shows "排序方式：總分"

##### Example: label by strategy

| strategy | config keys | Label |
| -------- | ----------- | ----- |
| snake_by_score | sort_by: total_score | 總分 |
| snake_by_score | sort_order: desc | 總分 |
| random | none | random |

<!-- @trace
source: fix-grouping-sort-label
updated: 2026-10-16
code:
  - src/lib/grouping/strategy-label.ts
  - src/components/admin/GroupManagement.tsx
  - src/app/admin/groups/[id]/page.tsx
  - src/app/api/admin/quizzes/[id]/groups/route.ts
  - src/lib/grouping/__unit__/strategy-label.test.ts
-->

---
### Requirement: Admin toggles group visibility from the group management page

The group management page SHALL show whether the quiz's groups are visible to students and SHALL let the admin switch it. When groups are hidden, the button SHALL read `公開分組`; when visible, it SHALL read `取消公開` and the page SHALL show the badge `學生可見`. Clicking the button SHALL send `PATCH /api/admin/quizzes/[id]` with the opposite `show_group_publicly` value. On success the page SHALL reflect the value returned by the server; turning visibility on SHALL show the toast `已公開分組，公開期間自動分組會暫停`, and turning it off SHALL show `已取消公開，自動分組將恢復`. On failure the page SHALL show the response message and keep the previous state.

#### Scenario: Publish hidden groups

- **WHEN** the admin opens the group page of a quiz whose `show_group_publicly` is false and clicks `公開分組`
- **THEN** the quiz's `show_group_publicly` becomes true
- **AND** the page shows the toast `已公開分組，公開期間自動分組會暫停`, the badge `學生可見` and the button `取消公開`

#### Scenario: Hide visible groups

- **WHEN** the admin clicks `取消公開` on a quiz whose groups are visible
- **THEN** the quiz's `show_group_publicly` becomes false and the page shows the toast `已取消公開，自動分組將恢復` and the button `公開分組`

#### Scenario: Toggle rejected by the server

- **WHEN** the visibility request fails with a non-2xx response
- **THEN** the page shows the response message and the button and badge keep their previous state


<!-- @trace
source: group-page-actions
updated: 2026-10-19
code:
  - CLAUDE.md
-->

---
### Requirement: Admin edits a group's name and notes from the group management page

Clicking `編輯組別` on a group SHALL open a dialog prefilled with that group's name and notes. The name SHALL be required and at most 100 characters, and the notes at most 500 characters; the save button SHALL be disabled while the trimmed name is empty. The dialog SHALL state that saving keeps later automatic grouping from replacing the groups. Saving SHALL send `PATCH /api/admin/groups/[groupId]` with `name` and `notes`. On success the dialog SHALL close and the group card SHALL show the saved name and notes. On HTTP 409 the page SHALL show the response message, close the dialog and reload the groups. On any other failure the page SHALL show the response message and keep the dialog open with the entered values.

#### Scenario: Rename a group

- **WHEN** the admin opens `編輯組別` on `第 1 組`, changes the name to `火箭隊` and the notes to `負責簡報`, and saves
- **THEN** the dialog closes and the group card shows `火箭隊` and `負責簡報`
- **AND** a later qualifying submission does not replace the quiz's groups

#### Scenario: Edit after another session regrouped

- **WHEN** the admin saves the dialog for a group that a regroup has already replaced
- **THEN** the page shows `分組已更新，請重新整理後再操作`
- **AND** the dialog closes and the page shows the current groups

#### Scenario: Empty name cannot be saved

- **WHEN** the admin clears the name field or leaves only spaces
- **THEN** the save button is disabled and no request is sent


<!-- @trace
source: group-page-actions
updated: 2026-10-19
code:
  - CLAUDE.md
-->

---
### Requirement: Admin exports the group list as CSV

Clicking `匯出分組名單` SHALL download, without a server request, a UTF-8 CSV file with a byte order mark named `<quiz title>-分組名單.csv`. The first row SHALL be `組別,學號,姓名,分數`. Each member of each group SHALL follow in group order and then member rank order, with the score left empty when the member has not submitted. Ungrouped participants SHALL follow with the group `未分組` and an empty score. Fields containing a comma, double quote or line break SHALL be quoted with inner quotes doubled, and a field whose first character is `=`, `+`, `-`, `@`, a tab or a carriage return, or whose first non-whitespace character is `=`, `+`, `-` or `@`, SHALL be prefixed with `'` so spreadsheet programs do not run it as a formula. When the page has no groups and no ungrouped participants, the button SHALL be disabled.

#### Scenario: Export groups and ungrouped participants

- **WHEN** the admin clicks `匯出分組名單` on a page showing groups and ungrouped participants
- **THEN** the browser downloads `<quiz title>-分組名單.csv` with one row per member and one row per ungrouped participant after the header

##### Example: CSV content

- **GIVEN** group `火箭隊` with members 王小明 (S001, 10) and 學生二 (S002, not submitted), and ungrouped participant `=HYPERLINK("x")` (S003)
- **WHEN** the CSV is built
- **THEN** its rows are:

| Row |
| --- |
| `組別,學號,姓名,分數` |
| `火箭隊,S001,王小明,10` |
| `火箭隊,S002,學生二,` |
| `未分組,S003,"'=HYPERLINK(""x"")",` |

<!-- @trace
source: group-page-actions
updated: 2026-10-19
code:
  - CLAUDE.md
-->