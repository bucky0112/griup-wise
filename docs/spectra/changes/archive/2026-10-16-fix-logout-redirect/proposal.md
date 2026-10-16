## Problem

`POST /api/auth/logout` builds its redirect from `NEXT_PUBLIC_APP_URL || 'http://localhost:3000'` (GitHub issue #4). Where the variable is missing or wrong, admins are sent to `http://localhost:3000/login`, and the student page's `fetch` logout fails with `Failed to fetch` because the redirect crosses origins (its catch block happens to navigate to the completion page). The response is also a 307, which preserves the method, so the admin pages' `<form method="POST">` logout turns into `POST /login`.

## Root Cause

`NextResponse.redirect(new URL(redirectUrl, baseUrl))` uses an absolute URL from an environment variable with a hard-coded development fallback, and `NextResponse.redirect` defaults to status 307.

## Proposed Solution

- Answer with HTTP 303 See Other and a relative `Location` (`/login`, `/quiz/complete` or `/`), so the browser stays on the origin it used and follows the redirect with GET.
- Stop reading `NEXT_PUBLIC_APP_URL` in the logout route.

## Non-Goals (optional)

- Removing `NEXT_PUBLIC_APP_URL` from Railway or `.env.example`; nothing else reads it, but deleting configuration is left to the operator.
- Changing the logout buttons or the student completion page.

## Capabilities

- New Capabilities: `authentication`
- Modified Capabilities: none

## Success Criteria

- Logout answers 303 with `Location: /login` for an admin, `/quiz/complete` for a student and `/` without a session, independent of `NEXT_PUBLIC_APP_URL`.
- The session cookie is cleared in all three cases.
- Clicking 登出 on an admin page lands on `GET /login` on the same origin; the student page logs out without a fetch error.

## Impact

- Affected code:
  - Modified: src/app/api/auth/logout/route.ts, vitest.config.ts
  - New: src/app/api/auth/logout/__unit__/route.test.ts
  - Removed: none
