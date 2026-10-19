# quiz-management Specification

## Purpose

Quiz management lets the admin who owns a quiz open it to students or close it after it has been created, and tells them whether the shared link currently works.

## Requirements

### Requirement: Quiz owner changes whether a quiz is active

`PATCH /api/admin/quizzes/[id]` SHALL accept a boolean `is_active` alone or together with `show_group_publicly`, update the quiz, and return the stored `is_active` and `show_group_publicly` in its `quiz` object. Only the admin who created the quiz SHALL change it; any other admin SHALL get HTTP 403 and the quiz SHALL be unchanged. A non-boolean `is_active` SHALL get HTTP 400.

#### Scenario: Owner activates an inactive quiz

- **WHEN** the owner sends `{ "is_active": true }` for a quiz whose `is_active` is false
- **THEN** the response status is 200 with `quiz.is_active = true`
- **AND** a student can then log in to that quiz through `POST /api/auth/student`

#### Scenario: Owner deactivates an active quiz

- **WHEN** the owner sends `{ "is_active": false }` for an active quiz
- **THEN** the response status is 200 with `quiz.is_active = false`
- **AND** a student login to that quiz returns 401 with `測驗不存在或未開放，請檢查測驗代碼`

#### Scenario: Another admin cannot change it

- **WHEN** an admin who did not create the quiz sends `{ "is_active": true }`
- **THEN** the response status is 403 and `is_active` is unchanged


<!-- @trace
source: quiz-activation-toggle
updated: 2026-10-19
code:
  - CLAUDE.md
-->

---
### Requirement: Admin toggles activation from the quiz pages

The quiz list (`/admin/quizzes`) and the question management page (`/admin/quizzes/[id]/questions`) SHALL show, next to 分享連結 for each quiz, a button reading `啟用測驗` when the quiz is inactive and `停用測驗` when it is active. Clicking `啟用測驗` SHALL activate the quiz at once and show the toast `測驗已啟用，學生可以用分享連結進入`. Clicking `停用測驗` SHALL first open a dialog stating that students who have not submitted will no longer be able to submit; only confirming SHALL deactivate the quiz and show the toast `測驗已停用`. After a successful change the page SHALL show the stored state (button text and the 進行中/未啟用 badge on the list). On failure the page SHALL show the response message and keep the previous state.

#### Scenario: Activate from the question page

- **WHEN** the owner opens the question page of an inactive quiz and clicks `啟用測驗`
- **THEN** the quiz becomes active, the toast `測驗已啟用，學生可以用分享連結進入` appears and the button reads `停用測驗`

#### Scenario: Deactivation needs confirmation

- **WHEN** the owner clicks `停用測驗` on the quiz list
- **THEN** a confirmation dialog opens and the quiz stays active until the owner confirms
- **AND** after confirming, the list shows `未啟用` for that quiz and the button reads `啟用測驗`


<!-- @trace
source: quiz-activation-toggle
updated: 2026-10-19
code:
  - CLAUDE.md
-->

---
### Requirement: Share dialog warns about inactive quizzes

When the 分享連結 dialog opens for a quiz that is not active, it SHALL show the warning `此測驗尚未啟用，學生目前無法用連結進入，請先按「啟用測驗」`. For an active quiz the warning SHALL NOT appear.

#### Scenario: Sharing an inactive quiz

- **WHEN** the owner opens 分享連結 for an inactive quiz
- **THEN** the dialog shows the link and the inactive warning

<!-- @trace
source: quiz-activation-toggle
updated: 2026-10-19
code:
  - CLAUDE.md
-->

---
### Requirement: Quiz owner deletes a participant

`DELETE /api/admin/quizzes/[id]/participants/[participantId]` SHALL delete the participant together with their submission, answers, group memberships and grouping events, when the logged-in admin created the quiz and the participant belongs to that quiz. The deletion SHALL run under the quiz grouping lock. It SHALL NOT change the active grouping run's status: an automatic run stays automatic and an admin-managed run stays admin-managed. After the deletion the same student number SHALL be able to log in to the quiz again with any name, creating a new participant. Another admin SHALL get HTTP 403, a participant that does not exist in the quiz SHALL get HTTP 404 with `參與者不存在`, and in both cases nothing SHALL change.

#### Scenario: Free a student number taken by mistake

- **WHEN** quiz Q has participant 李大華 with student number `S001` who has submitted
- **AND** the owner deletes that participant
- **THEN** the response status is 200 and Q has no participant, submission or answer for `S001`
- **AND** a login to Q as 王小明 with student number `S001` returns 200 and creates a new participant

#### Scenario: Grouped participant on an automatic run

- **WHEN** the deleted participant was a member of a group in Q's automatic active run
- **THEN** the other members stay in their groups and the run's `config.trigger` is still `automatic`

#### Scenario: Not the owner

- **WHEN** an admin who did not create Q deletes one of its participants
- **THEN** the response status is 403 and the participant still exists

#### Scenario: Participant of another quiz

- **WHEN** the owner of Q sends a participant id that belongs to a different quiz
- **THEN** the response status is 404 with `參與者不存在` and that participant still exists


<!-- @trace
source: delete-quiz-participant
updated: 2026-10-19
code:
  - CLAUDE.md
-->

---
### Requirement: Scores page offers participant deletion

The scores page (`/admin/scores/[quizId]`) SHALL show a `刪除` button on every row of the 已交卷 and 未交卷 tables. Clicking it SHALL open a dialog naming the participant's student number and name and stating that their answers and score will be deleted and the student number can then be used to log in again. Only confirming SHALL send the deletion; on success the page SHALL show the toast `已刪除參與者` and reload so the row disappears. On failure it SHALL show the response message and keep the row.

#### Scenario: Delete from the submitted table

- **WHEN** the owner clicks `刪除` on 李大華 (S001) in the 已交卷 table and confirms
- **THEN** the toast `已刪除參與者` appears and S001 no longer appears on the page

#### Scenario: Cancel keeps the participant

- **WHEN** the owner clicks `刪除` and then cancels the dialog
- **THEN** no request is sent and the row stays

<!-- @trace
source: delete-quiz-participant
updated: 2026-10-19
code:
  - CLAUDE.md
-->