## Why

An admin cannot remove a class once it has ever had a quiz: the class delete API refuses with "無法刪除，此班級仍有關聯的測驗", and there is no way to delete a quiz anywhere in the app. Test classes such as "小尖兵-測試" are stuck in every list. Every delete in the app today is a hard delete and the database cascades class → quiz → questions, participants, submissions, answers and groups, so simply adding a hard "delete quiz" would make a mis-click permanently erase students' scores. The admin prefers deleted data to stay recoverable.

## What Changes

- Quizzes and classes gain a `deleted_at` timestamp. Deleting them sets this timestamp instead of removing rows; no answers, scores or groups are removed.
- New: the quiz owner can delete a quiz from the quiz list, after a confirmation dialog. Deleting also deactivates the quiz, so students are refused by the existing "inactive quiz" checks.
- Changed: deleting a class becomes a soft delete, and is refused only while the class still has a quiz that is not deleted.
- Deleted quizzes and classes disappear from the admin quiz list, class list, admin dashboard, groups pages and pending-review list.
- Admin pages and APIs addressed by a deleted quiz's or class's ID answer "not found", and every API that changes a quiz's data (activation, questions, participants, grouping) refuses a deleted quiz. A new quiz cannot be created in a deleted class.
- No restore screen: restoring is done by clearing `deleted_at` in the database.

## Non-Goals

- Restore UI for deleted quizzes or classes.
- Changing question, participant or grouping deletes; they stay hard deletes.
- Purging soft-deleted rows after a retention period.

## Capabilities

### New Capabilities

- `class-management`: deleting a class, and how deleted classes are hidden from admins.

### Modified Capabilities

- `quiz-management`: adds quiz deletion and how deleted quizzes are hidden from admins and refused to students.

## Impact

- Affected specs: quiz-management (adds requirements), class-management (new)
- Affected code:
  - Modified: src/lib/db/schema.ts
  - New: src/lib/db/migrations (one generated migration adding deleted_at to quizzes and classes)
  - Modified: src/app/api/admin/quizzes/[id]/route.ts
  - Modified: src/app/api/admin/quizzes/route.ts
  - Modified: src/app/api/admin/classes/route.ts
  - Modified: src/app/api/admin/classes/[id]/route.ts
  - Modified: src/app/api/quizzes/[id]/quiz-info/route.ts
  - Modified: src/app/api/quizzes/[id]/questions/route.ts
  - Modified: src/app/api/quizzes/[id]/questions/[questionId]/route.ts
  - Modified: src/app/api/admin/quizzes/[id]/participants/[participantId]/route.ts
  - Modified: src/app/api/admin/quizzes/[id]/groups/auto/route.ts
  - Modified: src/app/api/admin/quizzes/[id]/groups/create/route.ts
  - Modified: src/app/api/admin/quizzes/[id]/groups/regenerate/route.ts
  - Modified: src/lib/grouping/manager.ts
  - Modified: src/app/api/admin/groups/overview/route.ts
  - Modified: src/app/api/admin/reviews/pending/route.ts
  - Modified: src/app/admin/page.tsx
  - Modified: src/app/admin/quizzes/page.tsx
  - Modified: src/app/admin/classes/page.tsx
  - Modified: src/app/admin/classes/[id]/page.tsx
  - Modified: src/app/admin/groups/page.tsx
  - Modified: src/app/admin/groups/[id]/page.tsx
  - Modified: src/app/admin/scores/[quizId]/page.tsx
  - New: src/components/admin/DeleteQuizButton.tsx
- Deployment: Railway runs pnpm db:migrate before each deploy, so the migration applies on staging and production automatically.
