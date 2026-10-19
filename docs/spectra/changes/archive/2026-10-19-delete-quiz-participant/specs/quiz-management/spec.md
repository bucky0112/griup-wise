## ADDED Requirements

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

### Requirement: Scores page offers participant deletion

The scores page (`/admin/scores/[quizId]`) SHALL show a `刪除` button on every row of the 已交卷 and 未交卷 tables. Clicking it SHALL open a dialog naming the participant's student number and name and stating that their answers and score will be deleted and the student number can then be used to log in again. Only confirming SHALL send the deletion; on success the page SHALL show the toast `已刪除參與者` and reload so the row disappears. On failure it SHALL show the response message and keep the row.

#### Scenario: Delete from the submitted table

- **WHEN** the owner clicks `刪除` on 李大華 (S001) in the 已交卷 table and confirms
- **THEN** the toast `已刪除參與者` appears and S001 no longer appears on the page

#### Scenario: Cancel keeps the participant

- **WHEN** the owner clicks `刪除` and then cancels the dialog
- **THEN** no request is sent and the row stays
