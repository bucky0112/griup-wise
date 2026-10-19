## Problem

A quiz can only be made active from the 「立即啟用測驗」 checkbox when it is created. After that no page or API can change it, so a quiz created inactive — such as production 「小尖兵-v6 / 小測驗」 — can never be answered: its 分享連結 is still offered, but students who open it get 401 「測驗不存在或未開放，請檢查測驗代碼」 (GitHub issue #40). Admins also cannot close a quiz once it is over.

## Root Cause

`QuizForm` is only used by `/admin/quizzes/new`; there is no quiz edit page. `PATCH /api/admin/quizzes/[id]` validates its body with a schema that only allows `show_group_publicly`, so `is_active` cannot be updated. `ShareQuizLink` does not know whether the quiz is active.

## Proposed Solution

- `PATCH /api/admin/quizzes/[id]` also accepts `is_active` (owner only, as today) and returns it.
- A 「啟用測驗」/「停用測驗」 button sits next to 分享連結 on the quiz list (`/admin/quizzes`) and on the question management page (`/admin/quizzes/[id]/questions`). Activating happens at once; deactivating first asks for confirmation in a dialog, because students who have not submitted can no longer submit.
- The 分享連結 dialog warns when the quiz is not active that students cannot enter until it is enabled.

## Non-Goals

- A full quiz edit page (title, class) — the user chose the two buttons only.
- Changing what students see for inactive quizzes, or letting in-progress students submit after deactivation.
- Scheduling activation by time.

## Success Criteria

- An admin can activate an inactive quiz from either page, and a student can then log in through the shared link.
- Deactivating asks for confirmation and then makes student login return the existing 401 message.
- `pnpm test`, `pnpm build` and `pnpm lint` pass.

## Impact

- Affected specs: quiz-management (new capability)
- Affected code:
  - Modified: src/app/api/admin/quizzes/[id]/route.ts, src/app/admin/quizzes/page.tsx, src/app/admin/quizzes/[id]/questions/page.tsx, src/components/admin/ShareQuizLink.tsx
  - New: src/components/admin/QuizActivationToggle.tsx, src/app/api/admin/quizzes/[id]/__integration__/route.test.ts
  - Removed: none
- No migration. After deployment, production 「小尖兵-v6 / 小測驗」 can be activated from the new button.
