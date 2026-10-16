# question-management Specification

## Purpose

Question management lets an admin add questions to a quiz and tells them, before anything is sent, which required field of a question is missing.

## Requirements

### Requirement: Add-question form reports missing required fields

The add-question form SHALL block submission and show a message under the relevant field when a choice question has fewer than two options, has an empty option, or has no correct answer, and when a short-text question that requires code has no expected language. No request SHALL be sent while any of these messages is shown.

#### Scenario: Choice question missing parts

- **WHEN** an admin submits a single-choice question whose options or correct answer are incomplete
- **THEN** the form shows the matching message under the options section
- **AND** no request is sent to the questions API

##### Example: validation messages

| Input | Field with message | Message |
| ----- | ------------------ | ------- |
| single choice, options `["2"]`, correct `["2"]` | options | 至少需要 2 個選項 |
| single choice, options `["2", ""]`, correct `["2"]` | options | 選項不可空白 |
| single choice, options `["2", "3"]`, no correct answer | correctAnswers | 請選擇正確答案 |
| short text, response format `code`, expected language empty | expectedLanguage | 請輸入預期程式語言 |
| single choice, options `["2", "3"]`, correct `["2"]` | none | valid |

#### Scenario: Valid question is submitted

- **WHEN** an admin submits a complete single-choice question
- **THEN** the form sends it to the questions API as before

<!-- @trace
source: fix-question-form-validation-feedback
updated: 2026-10-16
code:
  - src/components/admin/question-form-schema.ts
  - src/components/admin/AddQuestionForm.tsx
  - src/components/admin/__unit__/question-form-schema.test.ts
-->
