# class-management Specification

## Purpose

Class management lets an admin remove classes they no longer need while keeping the class and its quizzes' data recoverable in the database.

## Requirements

### Requirement: Admin soft-deletes a class without live quizzes

Deleting a class SHALL record its deletion time instead of removing it, and SHALL NOT remove its quizzes or their data. Deleting SHALL be refused with `無法刪除，此班級仍有關聯的測驗` while the class has at least one quiz that is not deleted; deleted quizzes SHALL NOT block it.

#### Scenario: Class with only deleted quizzes

- **WHEN** an admin deletes a class whose only quiz is deleted
- **THEN** the response is 200 with message `班級刪除成功`
- **AND** the class and the quiz still exist in the database with deletion times

#### Scenario: Class with a live quiz

- **WHEN** an admin deletes a class that has a quiz that is not deleted
- **THEN** the response is 400 with message `無法刪除，此班級仍有關聯的測驗`
- **AND** the class has no deletion time

##### Example: 小尖兵-測試

- **GIVEN** class `小尖兵-測試` with one inactive quiz `小測驗`
- **WHEN** the admin deletes `小測驗` and then deletes `小尖兵-測試`
- **THEN** both deletions succeed and neither appears in the admin lists


<!-- @trace
source: soft-delete-quizzes-and-classes
updated: 2026-10-20
code:
  - CLAUDE.md
-->

---
### Requirement: Deleted classes are hidden from admins

The class list SHALL NOT show deleted classes. The class detail page and class APIs addressed by a deleted class's ID SHALL answer as for a class that does not exist, and creating a quiz in a deleted class SHALL be refused.

#### Scenario: Class list hides a deleted class

- **WHEN** an admin opens the class list after deleting a class
- **THEN** the deleted class is not listed

#### Scenario: Creating a quiz in a deleted class

- **WHEN** an admin creates a quiz with the ID of a deleted class
- **THEN** the request is refused as for a class that does not exist and no quiz is created

<!-- @trace
source: soft-delete-quizzes-and-classes
updated: 2026-10-20
code:
  - CLAUDE.md
-->