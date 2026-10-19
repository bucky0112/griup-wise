## Purpose

Quiz management lets the admin who owns a quiz open it to students or close it after it has been created, and tells them whether the shared link currently works.

## ADDED Requirements

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

### Requirement: Admin toggles activation from the quiz pages

The quiz list (`/admin/quizzes`) and the question management page (`/admin/quizzes/[id]/questions`) SHALL show, next to 分享連結 for each quiz, a button reading `啟用測驗` when the quiz is inactive and `停用測驗` when it is active. Clicking `啟用測驗` SHALL activate the quiz at once and show the toast `測驗已啟用，學生可以用分享連結進入`. Clicking `停用測驗` SHALL first open a dialog stating that students who have not submitted will no longer be able to submit; only confirming SHALL deactivate the quiz and show the toast `測驗已停用`. After a successful change the page SHALL show the stored state (button text and the 進行中/未啟用 badge on the list). On failure the page SHALL show the response message and keep the previous state.

#### Scenario: Activate from the question page

- **WHEN** the owner opens the question page of an inactive quiz and clicks `啟用測驗`
- **THEN** the quiz becomes active, the toast `測驗已啟用，學生可以用分享連結進入` appears and the button reads `停用測驗`

#### Scenario: Deactivation needs confirmation

- **WHEN** the owner clicks `停用測驗` on the quiz list
- **THEN** a confirmation dialog opens and the quiz stays active until the owner confirms
- **AND** after confirming, the list shows `未啟用` for that quiz and the button reads `啟用測驗`

### Requirement: Share dialog warns about inactive quizzes

When the 分享連結 dialog opens for a quiz that is not active, it SHALL show the warning `此測驗尚未啟用，學生目前無法用連結進入，請先按「啟用測驗」`. For an active quiz the warning SHALL NOT appear.

#### Scenario: Sharing an inactive quiz

- **WHEN** the owner opens 分享連結 for an inactive quiz
- **THEN** the dialog shows the link and the inactive warning
