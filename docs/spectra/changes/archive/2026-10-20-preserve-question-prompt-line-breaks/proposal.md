## Problem

Long question prompts that contain line breaks (for example a bullet list of responsive breakpoints followed by an HTML snippet) are hard to read and hard to edit in the admin UI:

- The admin question list and the admin per-participant answer page render the prompt as one run-on paragraph, because line breaks collapse into spaces.
- The add-question and edit-question forms use a single-line text input for the prompt, so an admin sees only the first few dozen characters and cannot see or type line breaks.
- Worse, a single-line input strips newline characters from its value. Opening an existing multi-line question in the edit form and saving it (even to change only the score) silently removes every line break from the stored prompt.

## Root Cause

- `AddQuestionForm` and `EditQuestionForm` bind the `prompt` field to the `Input` component (an `<input type="text">`), which cannot hold newline characters.
- The prompt is rendered in a plain `<p>` without `whitespace-pre-wrap` in the admin question list page and the admin participant answer page. The student-facing `QuestionCard` and the admin `ReviewSubmissions` already use `whitespace-pre-wrap` and display correctly.

## Proposed Solution

- Bind the prompt field in both question forms to the existing `Textarea` component (which auto-grows with content via `field-sizing-content`), so line breaks are visible, editable, and preserved on save.
- Add `whitespace-pre-wrap` to the prompt paragraph in the admin question list page and the admin participant answer page, matching the student-facing rendering.

## Non-Goals

- No Markdown or rich-text rendering of prompts; line breaks are shown as-is.
- No repair of prompts whose line breaks were already lost by earlier edits; that data cannot be recovered automatically.
- No change to the API, database schema, or validation rules.

## Success Criteria

- An admin can type a multi-line prompt in the add-question form, and after saving the admin question list shows it on multiple lines.
- Opening a multi-line question in the edit form shows every line, and saving without touching the prompt keeps the stored prompt byte-for-byte identical.
- The admin participant answer page shows the prompt with its line breaks.

## Impact

- Affected specs: question-management (adds a requirement)
- Affected code:
  - Modified: src/components/admin/AddQuestionForm.tsx
  - Modified: src/components/admin/EditQuestionForm.tsx
  - Modified: src/app/admin/quizzes/[id]/questions/page.tsx
  - Modified: src/app/admin/answers/[quizId]/[participantId]/page.tsx
