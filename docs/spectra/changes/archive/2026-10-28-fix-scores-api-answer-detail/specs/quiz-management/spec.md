## ADDED Requirements

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
