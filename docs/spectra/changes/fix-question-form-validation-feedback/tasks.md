## 1. Schema with field-level errors

- [x] 1.1 Write `src/components/admin/__unit__/question-form-schema.test.ts` from the spec example table and add `src/**/__unit__/**/*.test.ts` to the Vitest include list. Verify: the test fails before `question-form-schema.ts` exists.
- [x] 1.2 [after: 1.1] Add-question form reports missing required fields: move `questionSchema` into `src/components/admin/question-form-schema.ts`, replace the object-level `.refine()` with `.superRefine()` adding issues at `options`, `correctAnswers` and `expectedLanguage`, and import it in `AddQuestionForm.tsx`. Verify: the unit test passes, and in the browser an incomplete choice question shows the message under the options section with no network request.

## 2. Wrap-up

- [x] 2.1 [after: 1.2] Run `pnpm test` and `pnpm build`; both exit 0. `pnpm lint` adds no problems compared with the base.
