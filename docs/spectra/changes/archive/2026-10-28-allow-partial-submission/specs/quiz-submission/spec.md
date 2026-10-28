## Purpose

Quiz submission covers how a student hands in a quiz from the quiz page, including handing it in with unanswered questions, and how each question's answer is stored and scored.

## ADDED Requirements

### Requirement: Unanswered question rule

The system SHALL treat a question as unanswered when its response matches the rule for its type, and SHALL apply the same rule on the student quiz page and in the submit API:

- `single`, `boolean`, `numeric`: the response is absent, `null`, or an empty string. `false` and `0` SHALL count as answered.
- `multiple`: the response is not an array or is an empty array.
- `short_text`: the response is absent or `null`, a string that is empty after trimming whitespace, or an object whose `content` is missing or empty after trimming whitespace.

#### Scenario: Whitespace-only short text is unanswered

- **WHEN** a student types only spaces and line breaks into a short_text question
- **THEN** the progress count SHALL NOT count that question as answered
- **AND** the submit API SHALL store that question as unanswered

#### Scenario: False and zero are answers

- **WHEN** a student selects `false` on a boolean question and enters `0` on a numeric question
- **THEN** both questions SHALL count as answered

### Requirement: Submit with unanswered questions

The student quiz page SHALL let the student submit whenever no submission is in progress, regardless of how many questions are unanswered. The submit button SHALL be disabled only while a submission is in progress.

When N questions are unanswered and N is greater than 0, the hint under the progress count SHALL read `還有 N 題未作答，仍可提交`, and the confirmation dialog SHALL include the line `還有 N 題未作答，未作答題目以 0 分計`. When N is 0, the hint SHALL read `✓ 所有題目已完成，請檢查您的答案後點擊提交按鈕` and the dialog SHALL NOT include the unanswered line. Cancelling the dialog SHALL keep the student on the quiz page with their answers unchanged.

`POST /api/assignments/submit` SHALL NOT reject a submission because questions are unanswered or missing from the request body.

#### Scenario: Submit with two unanswered questions

- **WHEN** a student has answered 3 of 5 questions and clicks `提交答案`
- **THEN** the confirmation dialog SHALL include `還有 2 題未作答，未作答題目以 0 分計`
- **AND** confirming SHALL submit the quiz and show the submission success page

#### Scenario: Submit with no answers at all

- **WHEN** a student submits with an empty answers object
- **THEN** the submit API SHALL respond with HTTP 200
- **AND** the submission's total score SHALL be 0

#### Scenario: Cancel the confirmation

- **WHEN** a student with unanswered questions clicks `提交答案` and cancels the dialog
- **THEN** no submission SHALL be created
- **AND** the student's answers SHALL remain on the page

### Requirement: Store and score unanswered questions

On submission the system SHALL store exactly one answer row for every question in the quiz. For an unanswered question the stored `response` SHALL be the JSON value `null`, the earned score SHALL be 0, and the review status SHALL be `auto`, for every question type including `short_text`. An answered `short_text` question SHALL be stored with review status `pending`. The admin review list SHALL therefore show only answered short_text questions.

#### Scenario: Mixed submission stores one row per question

- **WHEN** a student submits a quiz in which some questions are unanswered
- **THEN** the number of stored answer rows SHALL equal the number of questions in the quiz
- **AND** every unanswered row SHALL have a `null` response, 0 points and review status `auto`

##### Example: three single-choice and two short-text questions

- **GIVEN** a quiz with questions S1, S2, S3 (single) and T1, T2 (short_text)
- **AND** the student answered S1 and S2 correctly, wrote `Ruby 是物件導向語言` in T1, typed only `   ` in T2, and left S3 blank
- **WHEN** the student submits
- **THEN** 5 answer rows are stored
- **AND** S3 and T2 have response `null`, 0 points and review status `auto`
- **AND** T1 has review status `pending`
- **AND** the admin review list for this submission shows only T1

#### Scenario: Admin sees unanswered questions

- **WHEN** an admin opens the answer page of a submission containing unanswered questions
- **THEN** each unanswered question SHALL show `未作答` as the student's answer
