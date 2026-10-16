## Problem

On the question management page, submitting a single- or multiple-choice question with an empty option, fewer than two options, or no correct answer does nothing: no request is sent and no error is shown (GitHub issue #3). A short-text question that requires code but has no expected language behaves the same way. Reproduced locally and on the Railway site on 2026-10-15.

## Root Cause

`questionSchema` in `src/components/admin/AddQuestionForm.tsx` checks these rules in one object-level `.refine()` without a `path`, so react-hook-form stores the error under the form root. The form only renders field errors (`errors.options`, `errors.correctAnswers`, `errors.expectedLanguage`), so the message `請填寫完整的必要欄位` is never shown.

## Proposed Solution

- Move the schema into `src/components/admin/question-form-schema.ts` and replace the object-level `.refine()` with `.superRefine()` that adds one issue per broken rule, each with the `path` of the field the form already renders: `options`, `correctAnswers`, or `expectedLanguage`.
- Keep the form's existing error elements; they start showing the messages.
- Unit-test the schema with Vitest by adding a `src/**/__unit__/**/*.test.ts` include pattern.

## Non-Goals (optional)

- `EditQuestionForm` validation (it has no cross-field rules today and the API validates on save).
- API-side validation, which already rejects these inputs.
- Visual changes to the form.

## Capabilities

- New Capabilities: `question-management`
- Modified Capabilities: none

## Success Criteria

- Submitting with fewer than two options, an empty option, or no correct answer shows the matching message under the options section and sends no request.
- A code-format short-text question without an expected language shows a message under that field.
- A valid question still submits unchanged.

## Impact

- Affected code:
  - Modified: src/components/admin/AddQuestionForm.tsx, vitest.config.ts
  - New: src/components/admin/question-form-schema.ts, src/components/admin/__unit__/question-form-schema.test.ts
  - Removed: none
