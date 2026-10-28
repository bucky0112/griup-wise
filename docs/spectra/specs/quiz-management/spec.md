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

---
### Requirement: Quiz owner soft-deletes a quiz

The quiz owner SHALL be able to delete a quiz. Deleting a quiz SHALL record the deletion time and deactivate the quiz, and SHALL NOT remove the quiz's questions, participants, submissions, answers or groups. Only the admin who created the quiz SHALL be able to delete it. Deleting a quiz that is missing or already deleted SHALL answer not found.

#### Scenario: Owner deletes a quiz

- **WHEN** the quiz owner deletes an active quiz that has submissions
- **THEN** the response is 200 with message `測驗已刪除`
- **AND** the quiz is inactive and has a deletion time
- **AND** its submissions and answers still exist

#### Scenario: Another admin cannot delete it

- **WHEN** an admin who did not create the quiz deletes it
- **THEN** the response is 403 with message `無權限修改此測驗`
- **AND** the quiz has no deletion time

#### Scenario: Deleting twice

- **WHEN** the owner deletes a quiz that is already deleted
- **THEN** the response is 404

#### Scenario: Students are refused after deletion

- **WHEN** a student logs in to a deleted quiz
- **THEN** login is refused with `測驗不存在或未開放，請檢查測驗代碼`


<!-- @trace
source: soft-delete-quizzes-and-classes
updated: 2026-10-20
code:
  - CLAUDE.md
-->

---
### Requirement: Deleted quizzes are hidden from admins and cannot be changed

Admin lists SHALL NOT show deleted quizzes: the quiz list, the admin dashboard, the groups pages and the pending-review list. Admin pages and APIs addressed by a deleted quiz's ID SHALL answer as for a quiz that does not exist, and every API that changes a quiz's activation, questions, participants or groups SHALL refuse a deleted quiz.

#### Scenario: Quiz list hides a deleted quiz

- **WHEN** the owner opens the quiz list after deleting one of two quizzes
- **THEN** only the other quiz is listed

#### Scenario: Changing a deleted quiz is refused

- **WHEN** the owner adds a question to, or changes the activation of, a deleted quiz
- **THEN** the response is 404 and nothing is stored

##### Example: refused changes

| Request on a deleted quiz | Status |
| ------------------------- | ------ |
| POST /api/quizzes/{id}/questions | 404 |
| PATCH /api/admin/quizzes/{id} `{ is_active: true }` | 404 |
| DELETE /api/admin/quizzes/{id} | 404 |


<!-- @trace
source: soft-delete-quizzes-and-classes
updated: 2026-10-20
code:
  - CLAUDE.md
-->

---
### Requirement: Quiz list offers quiz deletion

The quiz list SHALL show a delete button on each quiz. Pressing it SHALL open a confirmation dialog naming the quiz; confirming SHALL delete the quiz and remove it from the list, and cancelling SHALL leave it unchanged.

#### Scenario: Confirm deletes

- **WHEN** the owner presses 刪除 on a quiz and confirms
- **THEN** the toast `已刪除測驗` appears and the quiz is no longer listed

#### Scenario: Cancel keeps the quiz

- **WHEN** the owner presses 刪除 and then 取消
- **THEN** no request is sent and the quiz stays listed

<!-- @trace
source: soft-delete-quizzes-and-classes
updated: 2026-10-20
code:
  - CLAUDE.md
-->

---
### Requirement: Scores API reports per-question earned scores

`GET /api/admin/quizzes/[id]/scores` SHALL return, for every participant who has submitted, an `answers_detail` entry for each question of the quiz whose `earned_score` equals the `earned_score` stored on that participant's answer to the question, and whose `max_score` equals the question's score. A question for which the participant's submission has no answer row SHALL report `earned_score` 0. A participant who has not submitted SHALL have an empty `answers_detail`.

#### Scenario: Correct answer is reported with its score

- **WHEN** a participant of quiz Q submitted and their answer to a 10-point question is stored with `earned_score` 10
- **AND** the quiz owner requests the scores of Q
- **THEN** that participant's `answers_detail` entry for the question has `earned_score` 10 and `max_score` 10

##### Example: two participants, three questions

- **GIVEN** quiz Q has questions Q1 (10 points), Q2 (10 points) and Q3 (5 points); participant A's answers are stored as Q1=10, Q2=0 and no row for Q3; participant B's answers are stored as Q1=0, Q2=10, Q3=5; participant C has not submitted
- **WHEN** the owner requests `GET /api/admin/quizzes/Q/scores`
- **THEN** the per-question `earned_score` values are:

| Participant | Q1 | Q2 | Q3 | Notes |
| ----------- | -- | -- | -- | ----- |
| A | 10 | 0 | 0 | Q3 has no answer row |
| B | 0 | 10 | 5 | |
| C | — | — | — | `answers_detail` is empty |

#### Scenario: Answers of one participant are not attributed to another

- **WHEN** two participants of Q submitted with different stored scores for the same question
- **THEN** each participant's `answers_detail` reports their own stored score for that question

<!-- @trace
source: fix-scores-api-answer-detail
updated: 2026-10-28
code:
  - CLAUDE.md
-->