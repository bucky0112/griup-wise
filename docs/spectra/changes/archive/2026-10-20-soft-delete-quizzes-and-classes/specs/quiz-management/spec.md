## ADDED Requirements

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

### Requirement: Quiz list offers quiz deletion

The quiz list SHALL show a delete button on each quiz. Pressing it SHALL open a confirmation dialog naming the quiz; confirming SHALL delete the quiz and remove it from the list, and cancelling SHALL leave it unchanged.

#### Scenario: Confirm deletes

- **WHEN** the owner presses 刪除 on a quiz and confirms
- **THEN** the toast `已刪除測驗` appears and the quiz is no longer listed

#### Scenario: Cancel keeps the quiz

- **WHEN** the owner presses 刪除 and then 取消
- **THEN** no request is sent and the quiz stays listed
