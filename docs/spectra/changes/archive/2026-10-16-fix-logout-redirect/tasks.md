## 1. Same-origin 303 redirect

- [x] 1.1 Write `src/app/api/auth/logout/__unit__/route.test.ts` covering the spec example table (admin, student, no session) with `@/lib/session` mocked, asserting status 303, the relative `Location`, and that `clearSession` was called, once with `NEXT_PUBLIC_APP_URL` unset and once set to another host; ensure the Vitest include list covers `src/**/__unit__/**/*.test.ts`. Verify: the tests fail before the route change (status 307 and an absolute location).
- [x] 1.2 [after: 1.1] Logout redirects on the same origin with GET: return `new NextResponse(null, { status: 303, headers: { Location } })` with the relative target and remove the `NEXT_PUBLIC_APP_URL` fallback. Verify: the unit tests pass; locally, clicking 登出 on `/admin` lands on `GET /login`, and the student page's logout shows `/quiz/complete` without a console error.

## 2. Wrap-up

- [x] 2.1 [after: 1.2] Run `pnpm test` and `pnpm build`; both exit 0. `pnpm lint` adds no problems compared with the base.
